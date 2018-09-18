(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
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
    let rentalProxy;

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

            // rentalProxy will have all the interfaces of DeviseRentalImpl contract
            // future function calls are directly from rentalProxy
            rentalProxy = await DeviseRentalImpl.at(proxy.address);
        });

        it("Escrow wallet should be different from pitai", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            const ew = await rentalProxy.escrowWallet.call();
            assert.notEqual(ew, pitai);
        });
        it("getEscrowHistory should return an empty array if not set", async () => {
            const escrowHistory = await rentalProxy.getEscrowHistory();
            assert.deepEqual(escrowHistory, []);
        });
        it("getEscrowHistory should return an array of addresses if set", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            const escrowHistory = await rentalProxy.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet]);
        });
        it("getEscrowHistory should return an array of more than one address if set multiple times", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setEscrowWallet(clients[0]);
            const escrowHistory = await rentalProxy.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet, clients[0]]);
        });
        it("escrowHistory can contain duplicate addresses", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setEscrowWallet(clients[0]);
            await rentalProxy.setEscrowWallet(escrowWallet);
            const escrowHistory = await rentalProxy.getEscrowHistory();
            assert.deepEqual(escrowHistory, [escrowWallet, clients[0], escrowWallet]);
        });
        it("setEscrowWallet to the same address twice should revert", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            await assertRevert(rentalProxy.setEscrowWallet(escrowWallet));
        });
        it("setEscrowWallet by non-owner shoudl revert", async () => {
            await assertRevert(rentalProxy.setEscrowWallet(escrowWallet, {from: escrowWallet}));
        });

        it("Revenue wallet should be different from pitai", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            const rw = await rentalProxy.revenueWallet.call();
            assert.notEqual(rw, pitai);
        });
        it("getRevenueHistory should return an empty array if not set", async () => {
            const revenueHistory = await rentalProxy.getRevenueHistory();
            assert.deepEqual(revenueHistory, []);
        });
        it("getRevenueHistory should return an array of addresses if set", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            const revenueHistory = await rentalProxy.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet]);
        });
        it("revenueHistory can contain duplicate addresses", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            await rentalProxy.setRevenueWallet(clients[0]);
            await rentalProxy.setRevenueWallet(revenueWallet);
            const revenueHistory = await rentalProxy.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet, clients[0], revenueWallet]);
        });
        it("getRevenueHistory should return an array of more than one address if set multiple times", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            await rentalProxy.setRevenueWallet(clients[0]);
            const revenueHistory = await rentalProxy.getRevenueHistory();
            assert.deepEqual(revenueHistory, [revenueWallet, clients[0]]);
        });
        it("setRevenueWallet to the same address twice should revert", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            await assertRevert(rentalProxy.setRevenueWallet(revenueWallet));
        });
        it("setRevenueWallet by non-owner should revert", async () => {
            await assertRevert(rentalProxy.setRevenueWallet(revenueWallet, {from: revenueWallet}));
        });
    });

    contract("Test escrowWallet and revenueWallet behavior", () => {
        beforeEach(async () => {
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

            // rentalProxy will have all the interfaces of DeviseRentalImpl contract
            // future function calls are directly from rentalProxy
            rentalProxy = await DeviseRentalImpl.at(proxy.address);
        });

        it("Provision should fail if escrowWallet is not set", async () => {
            const client = clients[0];
            const ether_amount = 1000;
            await transferTokens(token, rentalProxy, tokenWallet, client, ether_amount);
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await assertRevert(rentalProxy.provision(dvz_amount, {from: client}));
        });

        it("Revenue recognition should fail if revenueWallet is not set", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            const client = clients[0];
            const ether_amount = 1000;
            await transferTokens(token, rentalProxy, tokenWallet, client, ether_amount);
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await assertRevert(rentalProxy.leaseAll(30000, 1));
        });
    });

})();