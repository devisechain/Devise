(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const setupFixturesHelper = require('./helpers/setupFixtures');
    const assertRevert = require('./helpers/assertRevert');
    const {transferTokens} = require('./test-utils');

    const pitai = web3.eth.accounts[0];
    const tokenOwner = web3.eth.accounts[1];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    let token;
    let accountingProxy;
    let rental;

    contract("Test token owner wallet", () => {
        it("Token owner should be different from pitai", async () => {
            // the current implementation can't really enforce it
            token = await DeviseToken.new(cap, {from: pitai});
            const owner_old = await token.owner.call();
            assert.equal(owner_old, pitai);
            await token.transferOwnership(tokenOwner, {from: owner_old});
            const owner_new = await token.owner.call();
            assert.equal(owner_new, tokenOwner);
        });
    });

    contract("Test escrow wallet", () => {
        beforeEach(async () => {
            ({
                rental,
                token,
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, false, false));
        });

        it("Escrow wallet should be different from pitai", async () => {
            await rental.setEscrowWallet(escrowWallet);
            const ew = await rental.escrowWallet.call();
            assert.notEqual(ew, pitai);
        });
        it("getEscrowHistory should return an empty array if not set", async () => {
            const escrowHistory = await rental.getEscrowHistory();
            assert.deepEqual(escrowHistory, []);
        });
        it("getEscrowHistory should return an array of addresses if set", async () => {
            await rental.setEscrowWallet(escrowWallet);
            const escrowHistory = await rental.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet]);
        });
        it("getEscrowHistory should return an array of more than one address if set multiple times", async () => {
            await rental.setEscrowWallet(escrowWallet);
            await rental.setEscrowWallet(clients[0]);
            const escrowHistory = await rental.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet, clients[0]]);
        });
        it("escrowHistory can contain duplicate addresses", async () => {
            await rental.setEscrowWallet(escrowWallet);
            await rental.setEscrowWallet(clients[0]);
            await rental.setEscrowWallet(escrowWallet);
            const escrowHistory = await rental.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet, clients[0], escrowWallet]);
        });
        it("setEscrowWallet to the same address twice should revert", async () => {
            await rental.setEscrowWallet(escrowWallet);
            await assertRevert(rental.setEscrowWallet(escrowWallet));
        });
        it("setEscrowWallet by non-owner shoudl revert", async () => {
            await assertRevert(rental.setEscrowWallet(escrowWallet, {from: escrowWallet}));
        });

        it("Revenue wallet should be different from pitai", async () => {
            await rental.setRevenueWallet(revenueWallet);
            const rw = await rental.revenueWallet.call();
            assert.notEqual(rw, pitai);
        });
        it("getRevenueHistory should return an empty array if not set", async () => {
            const revenueHistory = await rental.getRevenueHistory();
            assert.deepEqual(revenueHistory, []);
        });
        it("getRevenueHistory should return an array of addresses if set", async () => {
            await rental.setRevenueWallet(revenueWallet);
            const revenueHistory = await rental.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet]);
        });
        it("revenueHistory can contain duplicate addresses", async () => {
            await rental.setRevenueWallet(revenueWallet);
            await rental.setRevenueWallet(clients[0]);
            await rental.setRevenueWallet(revenueWallet);
            const revenueHistory = await rental.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet, clients[0], revenueWallet]);
        });
        it("getRevenueHistory should return an array of more than one address if set multiple times", async () => {
            await rental.setRevenueWallet(revenueWallet);
            await rental.setRevenueWallet(clients[0]);
            const revenueHistory = await rental.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet, clients[0]]);
        });
        it("setRevenueWallet to the same address twice should revert", async () => {
            await rental.setRevenueWallet(revenueWallet);
            await assertRevert(rental.setRevenueWallet(revenueWallet));
        });
        it("setRevenueWallet by non-owner should revert", async () => {
            await assertRevert(rental.setRevenueWallet(revenueWallet, {from: revenueWallet}));
        });
    });

    contract("Test escrowWallet and revenueWallet behavior", () => {
        beforeEach(async () => {
            ({
                rental,
                token,
                accountingProxy,
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, false, false));
        });

        it("Provision should fail if escrowWallet is not set", async () => {
            const client = clients[0];
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rental.address, dvz_amount, {from: client});
            await assertRevert(rental.provision(dvz_amount, {from: client}));
        });

        it("Revenue recognition should fail if revenueWallet is not set", async () => {
            await rental.setEscrowWallet(escrowWallet);
            const client = clients[0];
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            await assertRevert(rental.leaseAll(30000, 1));
        });
    });

})();