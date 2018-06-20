(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DeviseTokenSale = artifacts.require("./DeviseTokenSale");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
    const assertRevert = require('./helpers/assertRevert');

    const pitai = web3.eth.accounts[0];
    const tokenOwner = web3.eth.accounts[1];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    let token;
    let tokensale;
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

    contract("Test initial sale token wallet", () => {
        it("Token wallet for initial sale should be different from pitai", async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            // 07/01/2018 12:00:00am
            const openingTime = 1530403200;
            // 10/01/2018 12:00:00am
            const closingTime = 1538352000;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            const tw = await tokensale.tokenWallet.call();
            assert.notEqual(tw, pitai);
        });
    });

    contract("Test escrow wallet", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            // 07/01/2018 12:00:00am
            const openingTime = 1530403200;
            // 10/01/2018 12:00:00am
            const closingTime = 1538352000;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            await token.transferOwnership(tokenOwner, {from: pitai});
            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: tokenOwner});
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});

            const dateutils = await DateTime.new({from: pitai});
            const dstore = await DeviseEternalStorage.new({from: pitai});
            const proxy = await DeviseRentalProxy.new(token.address, dateutils.address, dstore.address, {from: pitai});

            await dstore.authorize(proxy.address, {from: pitai});

            const rentalImpl = await DeviseRentalImpl.new({from: pitai});

            await proxy.upgradeTo('1.0', rentalImpl.address, {from: pitai});

            // rentalProxy will have all the interfaces of DeviseRentalImpl contract
            // future function calls are directly from rentalProxy
            rentalProxy = await DeviseRentalImpl.at(proxy.address);
        });

        it("Escrow wallet should be different from pitai", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            const ew = await rentalProxy.escrowWallet.call();
            assert.notEqual(ew, pitai);
        });

        it("Revenue wallet should be different from pitai", async () => {
            await rentalProxy.setRevenueWallet(revenueWallet);
            const rw = await rentalProxy.revenueWallet.call();
            assert.notEqual(rw, pitai);
        });
    });

    contract("Test escrowWallet and revenueWallet behavior", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 360 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            await token.transferOwnership(tokenOwner, {from: pitai});
            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: tokenOwner});
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});

            const dateutils = await DateTime.new({from: pitai});
            const dstore = await DeviseEternalStorage.new({from: pitai});
            const proxy = await DeviseRentalProxy.new(token.address, dateutils.address, dstore.address, {from: pitai});

            await dstore.authorize(proxy.address, {from: pitai});

            const rentalImpl = await DeviseRentalImpl.new({from: pitai});

            await proxy.upgradeTo('1.0', rentalImpl.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);

            // rentalProxy will have all the interfaces of DeviseRentalImpl contract
            // future function calls are directly from rentalProxy
            rentalProxy = await DeviseRentalImpl.at(proxy.address);
        });

        it("Provision should fail if escrowWallet is not set", async () => {
            const client = clients[0];
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await assertRevert(rentalProxy.provision(dvz_amount, {from: client}));
        });

        it("Revenue recognition should fail if revenueWallet is not set", async () => {
            await rentalProxy.setEscrowWallet(escrowWallet);
            const client = clients[0];
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await assertRevert(rentalProxy.applyForPowerUser({from: client}));
        });
    });

})();