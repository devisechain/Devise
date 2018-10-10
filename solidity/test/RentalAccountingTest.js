(function () {
    const setupFixturesHelper = require('./helpers/setupFixtures');
    const {transferTokens} = require('./test-utils');

    const pitai = web3.eth.accounts[0];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    let token;
    let rentalProxy;

    async function setupFixtures() {
        ({
            rental: rentalProxy,
            proxy,
            token,
            dateTime,
            auctionProxy,
            accountingProxy
        } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, true));
    }

    contract("Test provision", () => {
        beforeEach(setupFixtures);

        it("The token balance should decrease after provision", async () => {
            const ether_amount = 1000;
            const client = clients[0];
            await transferTokens(token, rentalProxy, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf.call(client)).toNumber();
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
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
            await token.approve(accountingProxy.address, dvz_amount, {from: clients[0]});
            const amtProvisioned = 1 * millionDVZ * microDVZ;
            await rentalProxy.provision(amtProvisioned, {from: clients[0]});
            const numClients1 = (await rentalProxy.getNumberOfClients.call()).toNumber();
            assert.equal(numClients1, 1);
            assert.equal(await rentalProxy.getClient.call(0), clients[0]);
            // provision second client
            await transferTokens(token, rentalProxy, tokenWallet, clients[1], ether_amount);
            await token.approve(accountingProxy.address, dvz_amount, {from: clients[1]});
            await rentalProxy.provision(amtProvisioned, {from: clients[1]});
            const numClients2 = (await rentalProxy.getNumberOfClients.call()).toNumber();
            assert.equal(numClients2, 2);
            for (let i = 0; i < numClients2; i++) {
                assert.equal(await rentalProxy.getClient.call(i), clients[i]);
            }
        });

    });
})();