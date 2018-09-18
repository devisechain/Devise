(function () {
    const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImplTest");
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const {transferTokens} = require('./test-utils');
    const leptons = require('./leptons');
    const assertRevert = require('./helpers/assertRevert');

    const pitai = web3.eth.accounts[0];
    const pitaiWallet = web3.eth.accounts[1];
    const revenueWallet = web3.eth.accounts[2];
    const tokenWallet = web3.eth.accounts[3];
    const clients = web3.eth.accounts.slice(4);
    let token;
    let rental;
    let proxy;
    let estor;
    let microDVZ = 10 ** 6;
    let millionDVZ = 10 ** 6;

    async function setupFixtures() {
        // Setup all the contracts
        const cap = 10 * 10 ** 9 * 10 ** 6;
        token = await DeviseToken.new(cap, {from: pitai});
        // mint 1 billion tokens for token sale
        const saleAmount = 1 * 10 ** 9 * 10 ** 6;
        await token.mint(tokenWallet, saleAmount);
        dateTime = await DateTime.deployed();
        estor = await DeviseEternalStorage.new();
        // Create new upgradeable contract frontend (proxy)
        proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, 0, {from: pitai});
        // Set it's implementation version
        await proxy.upgradeTo((await DeviseRental_v1.new()).address);
        // Use implementation functions with proxy address
        rental = DeviseRental_v1.at(proxy.address);
        await rental.setEscrowWallet(pitaiWallet);
        await rental.setRevenueWallet(revenueWallet);
        await rental.addMasterNode(pitai);

        const escrow_cap = 1000000000000000000 * microDVZ;
        await token.approve(rental.address, escrow_cap, {from: pitaiWallet});

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
        await Promise.all(clients.map(async client => {
            const bal = (await web3.eth.getBalance(client)).toNumber();
            assert.isAbove(bal, web3.toWei(ether_amount, "ether"));
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
        }));
        await Promise.all(clients.map(async client => await token.approve(rental.address, 30 * millionDVZ * microDVZ, {from: client})));
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

        it("Can get data contract", async function () {
            const dataConract = await rental.getDataContract.call();
            assert.equal(dataConract, estor.address);
        });

        it("Can set new data contract", async function () {
            estor = await DeviseEternalStorage.new();
            await rental.setDataContract(estor.address);
            const dataConract = await rental.getDataContract.call();
            assert.equal(dataConract, estor.address);
        });

    });
})();