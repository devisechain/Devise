(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
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

    let token;
    let rentalProxy;

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
    }

    contract("Test provision", () => {
        beforeEach(setupFixtures);

        it("The token balance should decrease after provision", async () => {
            const ether_amount = 1000;
            const client = clients[0];
            await transferTokens(token, rentalProxy, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf.call(client)).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            const amtProvisioned = 1 * millionDVZ * microDVZ;
            await rentalProxy.provision(amtProvisioned, {from: client});
            const after = (await token.balanceOf.call(client)).toNumber();
            assert.equal(dvz_amount, after + amtProvisioned);
            const allow = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.equal(allow, amtProvisioned);
        });


        it("All provisioned clients are returned by getter", async () => {
            const numClients = (await rentalProxy.getNumberOfClients.call()).toNumber();
            assert.equal(numClients, 0);
            const ether_amount = 1000;
            // Provision one client
            await transferTokens(token, rentalProxy, tokenWallet, clients[0], ether_amount);
            const dvz_amount = (await token.balanceOf.call(clients[0])).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: clients[0]});
            const amtProvisioned = 1 * millionDVZ * microDVZ;
            await rentalProxy.provision(amtProvisioned, {from: clients[0]});
            const numClients1 = (await rentalProxy.getNumberOfClients.call()).toNumber();
            assert.equal(numClients1, 1);
            assert.equal(await rentalProxy.getClient.call(0), clients[0]);
            // provision second client
            await transferTokens(token, rentalProxy, tokenWallet, clients[1], ether_amount);
            await token.approve(rentalProxy.address, dvz_amount, {from: clients[1]});
            await rentalProxy.provision(amtProvisioned, {from: clients[1]});
            const numClients2 = (await rentalProxy.getNumberOfClients.call()).toNumber();
            assert.equal(numClients2, 2);
            for (let i = 0; i < numClients2; i++) {
                assert.equal(await rentalProxy.getClient.call(i), clients[i]);
            }
        });

    });
})();