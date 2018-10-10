(function () {
    const setupFixturesHelper = require('./helpers/setupFixtures');
    const TimeTravel = artifacts.require("./test/TimeTravel");
    const leptons = require('./leptons');
    const {transferTokens} = require('./test-utils');

    const pitai = web3.eth.accounts[0];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;
    const IUDecimals = 10 ** 6;

    let token;
    let accessControlProxy;
    let accountingProxy;
    let rental;
    let timeTravelSC;

    async function setupFixtures() {
        ({
            rental: rental,
            token,
            accessControlProxy,
            accountingProxy
        } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, true, false));

        await rental.addMasterNode(pitai);

        timeTravelSC = await TimeTravel.new({from: pitai});
        const AccessControl = artifacts.require("./test/AccessControlImplTimeTravel");
        await accessControlProxy.upgradeTo((await AccessControl.new()).address, {from: pitai});
        const accessControl = AccessControl.at(accessControlProxy.address);
        await accessControl.setTimeTravel(timeTravelSC.address, {from: pitai});
    }

    async function timeTravel(time) {
        await timeTravelSC.timeTravelForward(time, {from: pitai});
    }

    contract("Test time travel using the smart contract approach", () => {
        beforeEach(setupFixtures);

        it("Should deduct rent when time travel 31 days", async () => {
            const client = clients[0];
            const numLeptons = (await rental.getNumberOfLeptons()).toNumber();
            for (let i = numLeptons; i < leptons.length; i++) {
                await rental.addLepton(leptons[i], i > 0 ? leptons[i - 1] : '', IUDecimals * (3));
            }
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});

            // purchase a lot of tokens
            const ether_amount = 3000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);

            let dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});

            const bal0 = (await rental.getAllowance.call({from: client})).toNumber();
            const prc_per_bit = 5000 * microDVZ;
            const seats = 10;
            await rental.leaseAll(prc_per_bit, seats, {from: client});
            const bal1 = (await rental.getAllowance.call({from: client})).toNumber();
            assert.isAbove(bal0, bal1);
            await timeTravel(86400 * 31);
            const bal2 = (await rental.getAllowance.call({from: client})).toNumber();
            assert.isAbove(bal1, bal2);
        });
    });
})();