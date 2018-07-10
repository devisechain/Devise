const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImplTest");
const DeviseToken = artifacts.require("./DeviseToken");
const DateTime = artifacts.require("./DateTime");
const {timeTravel, evmSnapshot, evmRevert} = require('./test-utils');
const leptons = require('./leptons');
const assertRevert = require('./helpers/assertRevert');

const pitai = web3.eth.accounts[0];
const escrowWallet = web3.eth.accounts[1];
const revenueWallet = web3.eth.accounts[2];
const clients = web3.eth.accounts.slice(3);
let token;
let tokensale;
let rental;
let proxy;
let testSnapshotId = 0;
let estor;
let microDVZ = 10 ** 6;
let millionDVZ = 10 ** 6;

async function setupFixtures() {
    // Setup all the contracts
    const cap = 10 * 10 ** 9 * 10 ** 6;
    token = await DeviseToken.new(cap, {from: pitai});
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const blockNumber = web3.eth.blockNumber;
    const openingTime = web3.eth.getBlock(blockNumber).timestamp;
    const closingTime = openingTime + 360 * 24 * 60 * 60;
    tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
    const tokenWallet = await tokensale.tokenWallet.call();
    // mint 1 billion tokens for token sale
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    await token.mint(tokenWallet, saleAmount);
    await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
    dateTime = await DateTime.deployed();
    estor = await DeviseEternalStorage.new();
    // Create new upgradeable contract frontend (proxy)
    proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
    // Set it's implementation version
    await proxy.upgradeTo('1', (await DeviseRental_v1.new()).address);
    await tokensale.setRentalProxy(proxy.address);
    // Use implementation functions with proxy address
    rental = DeviseRental_v1.at(proxy.address);
    await rental.setEscrowWallet(escrowWallet);
    await rental.setRevenueWallet(revenueWallet);
    await rental.addMasterNode(pitai);


    const escrow_cap = 1000000000000000000 * microDVZ;
    await token.approve(rental.address, escrow_cap, {from: escrowWallet});

    // test addLepton can't be called prior to authorize
    await assertRevert(rental.addLepton(leptons[0], '', 1000000 * (3)));
    await estor.authorize(proxy.address);
    // Pit.AI adds leptons to rental contract
    await rental.addLepton(leptons[0], '', 1000000 * (3));
    await rental.addLepton(leptons[1], leptons[0], 1000000 * (3));
    await rental.addLepton(leptons[2], leptons[1], 1000000 * (2));
    await rental.addLepton(leptons[3], leptons[2], 1000000 * (2));
    await rental.addLepton(leptons[4], leptons[3], 1000000 * (1));
    await rental.addLepton(leptons[5], leptons[4], 1000000 * (1));
    // Some clients buy tokens and approve transfer to rental contract
    const ether_amount = 3000;
    await Promise.all(clients.map(async client => await tokensale.sendTransaction({
        from: client,
        value: web3.toWei(ether_amount, "ether"),
        gas: 1000000
    })));
    await Promise.all(clients.map(async client => await token.approve(rental.address, 30 * millionDVZ * microDVZ, {from: client})));
    // move forward 1 month
    await timeTravel(86400 * 31);
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


    it.skip("Pausing contract stops non owner functions", async () => {
        const client = clients[0];
        // non owner transactions
        await rental.provision(10000 * microDVZ, {from: client});
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
        await rental.setDataContract(estor.address, {from: pitai});
        await proxy.upgradeTo('3', (await DeviseRental_v1.new()).address);
        // client operations are paused
        await assertRevert(rental.provision(10000 * microDVZ, {from: client}));
        await assertRevert(rental.applyForPowerUser({from: client}));
        await assertRevert(rental.requestHistoricalData({from: client}));
        await assertRevert(rental.designateBeneficiary(client, {from: client}));
        await assertRevert(rental.leaseAll(1000 * microDVZ, 1, {from: client}));
        await assertRevert(rental.withdraw(1, {from: client}));
    });

    it.skip("Unpausing contract restores non owner functions", async () => {
        const client = clients[0];
        // Pause contract
        await proxy.pause({from: pitai});
        // UnPause contract
        await proxy.unpause({from: pitai});
        // owner operations still work
        await rental.setHistoricalDataFee(0, {from: pitai});
        await rental.setPowerUserClubFee(0, {from: pitai});
        await rental.setDataContract(estor.address, {from: pitai});
        await proxy.upgradeTo('4', (await DeviseRental_v1.new()).address, {from: pitai});
        // client operations are ok
        await rental.provision(10000 * microDVZ, {from: client});
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