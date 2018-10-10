(function () {
    const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
    const setupFixturesHelper = require('./helpers/setupFixtures');
    const leptons = require('./leptons');

    const pitai = web3.eth.accounts[0];
    const clients = web3.eth.accounts.slice(5);
    let token;
    let rental;
    let proxy;
    let estor;
    let microDVZ = 10 ** 6;

    async function setupFixtures() {
        const pitai = web3.eth.accounts[0];
        const tokenWallet = web3.eth.accounts[1];
        const escrowWallet = web3.eth.accounts[2];
        const revenueWallet = web3.eth.accounts[3];

        ({
            proxy,
            rental,
            token,
            eternalStorage: estor
        } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, true, true));
    }

    contract("UpdateLeaseTermsStatic", function () {
        // before running all tests, setup fixtures
        before(setupFixtures);

        it("Provides a way to get all bids", async () => {
            const provision_amount = 1000000 * microDVZ;
            const client1 = clients[0];
            const client2 = clients[1];
            await rental.provision(provision_amount, {from: client1});
            await rental.provision(provision_amount, {from: client2});
            const client_bid1 = 10 * 10 ** 3 * microDVZ;
            const client_bid2 = 20 * 10 ** 3 * microDVZ;
            await rental.leaseAll(client_bid1, 5, {from: client1});
            await rental.leaseAll(client_bid2, 7, {from: client2});
            const bidders = await rental.getAllBidders.call();
            const secondClient = [bidders[0][0], bidders[1][0], bidders[2][0]];
            const firstClient = [bidders[0][1], bidders[1][1], bidders[2][1]];
            assert.equal(secondClient[0], client2);
            assert.equal(secondClient[1].toNumber(), 7);
            assert.equal(secondClient[2].toNumber(), client_bid2);
            assert.equal(firstClient[0], client1);
            assert.equal(firstClient[1].toNumber(), 5);
            assert.equal(firstClient[2].toNumber(), client_bid1);
        });

        it("Can add new functions with upgrades", async () => {
            const DeviseRental_v2 = artifacts.require("./test/DeviseRentalImplV3");
            await rental.provision(10000, {from: clients[0]});
            const bal_v1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            // upgrade to v2
            const proxy = DeviseRentalBase.at(rental.address);
            await proxy.upgradeTo((await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
            const rental_v2 = DeviseRental_v2.at(proxy.address);
            const bal_v2 = (await rental_v2.getAllowance_v2.call({from: clients[0]})).toNumber();
            assert.equal(bal_v1, bal_v2);
        });

        it("Cannot override the type of state variables with upgrades", async () => {
            const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
            await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
            const rental_v3 = DeviseRental_v3.at(proxy.address);
            // can't work without Proxy fallback assembly
            await rental_v3.setVersion(3, {from: pitai});
            const testString1 = (await proxy.version.call({from: clients[0]})).toNumber();
            assert.equal(testString1, 3);
        });

        it("Only owner can upgrade contract", async () => {
            const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
            await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
            try {
                await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: clients[0]});
                expect.fail(null, null, "Only owner should be able to upgrade contract");
            } catch (e) {
            }
        });

        it("Can list all leptons in the blockchain", async () => {
            const numLeptons = (await rental.getNumberOfLeptons.call()).toNumber();
            assert.equal(numLeptons, 6);
            for (let i = 0; i < numLeptons; i++) {
                const lepton = await rental.getLepton(i);
                assert.equal(lepton[0], leptons[i]);
            }
        });

        it.skip("Can get data contract", async function () {
            const dataConract = await rental.getDataContract.call();
            assert.equal(dataConract, estor.address);
        });

        it.skip("Can set new data contract", async function () {
            estor = await DeviseEternalStorage.new();
            await rental.setDataContract(estor.address);
            const dataConract = await rental.getDataContract.call();
            assert.equal(dataConract, estor.address);
        });

    });
})();