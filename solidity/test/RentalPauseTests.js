const setupFixturesHelper = require('./helpers/setupFixtures');
const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImpl");
const {timeTravel, evmSnapshot, evmRevert} = require('./test-utils');
const assertRevert = require('./helpers/assertRevert');

const pitai = web3.eth.accounts[0];
const escrowWallet = web3.eth.accounts[1];
const revenueWallet = web3.eth.accounts[2];
const tokenWallet = web3.eth.accounts[3];
const clients = web3.eth.accounts.slice(4);
let token;
let rental;
let proxy;
let testSnapshotId = 0;
let eternalStorage;
let microDVZ = 10 ** 6;
let millionDVZ = 10 ** 6;

async function setupFixtures() {
    ({
        rental,
        proxy,
        token,
        eternalStorage
    } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, true, true));
    // snapshot the blockchain
    testSnapshotId = (await evmSnapshot()).result;
}

contract("Rental Contract (Pausing tests)", function () {
    // before running all tests, setup fixtures
    before(setupFixtures);
    // reset to our fixtures state after each test
    afterEach(async () => {
        evmRevert(testSnapshotId);
        // workaround ganache/testrpc crash
        testSnapshotId = (await evmSnapshot()).result;
    });


    it("Pausing contract stops non owner functions", async () => {
        const client = clients[0];
        // non owner transactions
        await rental.provision(12000 * microDVZ, {from: client});
        await rental.applyForPowerUser({from: client});
        await rental.requestHistoricalData({from: client});
        await rental.designateBeneficiary(client, {from: client});
        await rental.leaseAll(1000 * microDVZ, 1, {from: client});
        await rental.withdraw(1, {from: client});
        // Pause contract
        await proxy.pause({from: pitai});
        // owner operations still work
        await rental.setHistoricalDataFee(0, {from: pitai});
        await rental.setPowerUserClubFee(0, {from: pitai});
        // await rental.setDataContract(eternalStorage.address, {from: pitai});
        await proxy.upgradeTo((await DeviseRental_v1.new()).address);
        // client operations are paused
        await assertRevert(rental.provision(10000 * microDVZ, {from: client}));
        await assertRevert(rental.applyForPowerUser({from: client}));
        await assertRevert(rental.requestHistoricalData({from: client}));
        await assertRevert(rental.designateBeneficiary(client, {from: client}));
        await assertRevert(rental.leaseAll(1000 * microDVZ, 1, {from: client}));
        await assertRevert(rental.withdraw(1, {from: client}));
    });

    it("Unpausing contract restores non owner functions", async () => {
        const client = clients[0];
        // Pause contract
        await proxy.pause({from: pitai});
        // UnPause contract
        await proxy.unpause({from: pitai});
        // owner operations still work
        await rental.setHistoricalDataFee(0, {from: pitai});
        await rental.setPowerUserClubFee(0, {from: pitai});
        // await rental.setDataContract(eternalStorage.address, {from: pitai});
        await proxy.upgradeTo((await DeviseRental_v1.new()).address, {from: pitai});
        // client operations are ok
        await rental.provision(12000 * microDVZ, {from: client});
        await rental.applyForPowerUser({from: client});
        await rental.requestHistoricalData({from: client});
        await rental.designateBeneficiary(client, {from: client});
        await rental.leaseAll(1000 * microDVZ, 1, {from: client});
        await rental.withdraw(1, {from: client});
    });

    it("Should be able to make calls after pause", async () => {
        const client = clients[0];
        await rental.provision(10000 * microDVZ, {from: client});
        // Pause contract
        await proxy.pause({from: pitai});
        await rental.getAllowance.call({from: client});
    });

    it("Should be able to get the correct info after pause, with time travel", async () => {
        const client = clients[0];
        await rental.provision(millionDVZ * microDVZ, {from: client});
        const bal = (await rental.getAllowance.call({from: client})).toNumber();
        await rental.leaseAll(1000 * microDVZ, 1, {from: client});
        const bal1 = (await rental.getAllowance.call({from: client})).toNumber();
        assert.isAbove(bal, bal1);
        const sum1 = await rental.getClientSummary(client);
        const lt1 = sum1[3].toNumber();
        // Pause contract
        await proxy.pause({from: pitai});
        timeTravel(86400 * 180);
        const bal2 = (await rental.getAllowance.call({from: client})).toNumber();
        assert.isAbove(bal1, bal2);
        const sum2 = await rental.getClientSummary(client);
        const lt2 = sum2[3].toNumber();
        assert.isAtLeast(lt2, lt1 + 5);
    });
});