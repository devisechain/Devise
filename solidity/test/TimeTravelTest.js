(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./test/DeviseRentalImplTimeTravel");
    const TimeTravel = artifacts.require("./test/TimeTravel");
    const leptons = require('./leptons');
    const {transferTokens} = require('./test-utils');

    const pitai = web3.eth.accounts[0];
    const tokenOwner = web3.eth.accounts[1];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;
    const IUDecimals = 10 ** 6;

    let token;
    let rentalProxy;
    let timeTravelSC;

    async function setupFixtures() {
        const cap = 10 * billionDVZ * microDVZ;
        token = await DeviseToken.new(cap, {from: pitai});
        await token.transferOwnership(tokenOwner, {from: pitai});

        // mint 1 billion tokens for token sale
        const saleAmount = 1 * 10 ** 9 * 10 ** 6;
        await token.mint(tokenWallet, saleAmount, {from: tokenOwner});

        const dateutils = await DateTime.new({from: pitai});
        const dstore = await DeviseEternalStorage.new({from: pitai});
        const proxy = await DeviseRentalProxy.new(token.address, dateutils.address, dstore.address, 0, {from: pitai});

        await dstore.authorize(proxy.address, {from: pitai});

        const rentalImpl = await DeviseRentalImpl.new({from: pitai});

        await proxy.upgradeTo(rentalImpl.address, {from: pitai});

        rentalProxy = await DeviseRentalImpl.at(proxy.address);
        await rentalProxy.setEscrowWallet(escrowWallet);
        await rentalProxy.setRevenueWallet(revenueWallet);
        await rentalProxy.addMasterNode(pitai);

        timeTravelSC = await TimeTravel.new({from: pitai});
        await rentalProxy.setTimeTravel(timeTravelSC.address, {from: pitai});
    }

    async function timeTravel(time) {
        await timeTravelSC.timeTravelForward(time, {from: pitai});
    }

    contract("Test time travel using the smart contract approach", () => {
        beforeEach(setupFixtures);

        it("Should deduct rent when time travel 31 days", async () => {
            const client = clients[0];
            const numLeptons = (await rentalProxy.getNumberOfLeptons()).toNumber();
            for (let i = numLeptons; i < leptons.length; i++) {
                await rentalProxy.addLepton(leptons[i], i > 0 ? leptons[i - 1] : '', IUDecimals * (3));
            }
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});

            // purchase a lot of tokens
            const ether_amount = 3000;
            await transferTokens(token, rentalProxy, tokenWallet, client, ether_amount);

            let dvz_amount = 3 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});

            const bal0 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            const prc_per_bit = 5000 * microDVZ;
            const seats = 10;
            await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
            const bal1 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.isAbove(bal0, bal1);
            await timeTravel(86400 * 31);
            const bal2 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.isAbove(bal1, bal2);
        });
    });
})();