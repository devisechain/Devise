(function () {
    const TokenSaleWhitelist = artifacts.require("./DeviseTokenSale");
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
    const DeviseRental_v1 = artifacts.require("./DeviseRentalImpl");
    const assertRevert = require('./helpers/assertRevert');

    const num_clients = 20;
    const pitai = web3.eth.accounts[0];
    const clients = web3.eth.accounts.slice(3, num_clients + 2);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const microDVZ = 10 ** 6;
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    const ether_amount = 1000;

    let token;
    let tokensale;
    let proxy;

    contract("Token Sale Whitelist tests", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            const dateTime = await DateTime.deployed();
            const estor = await DeviseEternalStorage.new();
            // Create new upgradeable contract frontend (proxy)
            proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
            // Set it's implementation version
            await proxy.upgradeTo('1', (await DeviseRental_v1.new()).address);
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await TokenSaleWhitelist.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
        });

        it("Should not be able to buy if not on the whitelist", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            await assertRevert(tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            }));
        });

        it("Should be able to add an address to the whitelist", async () => {
            const client = clients[0];
            await tokensale.addToWhitelist(client, {from: pitai});
            const status = await tokensale.whitelist.call(client);
            assert.equal(status, true);
        });

        it("Should not be able to add an address to the whitelist if not the owner", async () => {
            const client = clients[0];
            const status = await tokensale.whitelist.call(client);
            assert.equal(status, false);
            await assertRevert(tokensale.addToWhitelist(client, {from: client}));
        });

        it("Should be a NO-OP if removing an address that is not on the whitelist", async () => {
            const client = clients[0];
            await tokensale.removeFromWhitelist(client, {from: pitai});
        });

        it("Should fail if removing an address while not the owner", async () => {
            const client = clients[0];
            await assertRevert(tokensale.removeFromWhitelist(client, {from: client}));
        });

        it("Should be able to buy tokens if on the whitelist", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            const client = clients[0];
            await tokensale.addToWhitelist(client, {from: pitai});
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(client)).toNumber();
            assert.equal(bal, ether_amount * initialRate * microDVZ);
        });

        it("Should not be able to buy tokens once taken off the whitelist", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            const client = clients[0];
            await tokensale.addToWhitelist(client, {from: pitai});
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(client)).toNumber();
            assert.equal(bal, ether_amount * initialRate * microDVZ);
            await tokensale.removeFromWhitelist(client, {from: pitai});
            const status = await tokensale.whitelist.call(client);
            assert.equal(status, false);
            await assertRevert(tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            }));
        });

        it("Shoule be able to add multiple addresses to the whitelist", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            const client1 = clients[0];
            const client2 = clients[1];
            await tokensale.addToWhitelist(client1, {from: pitai});
            await tokensale.addToWhitelist(client2, {from: pitai});
            let status = await tokensale.whitelist.call(client1);
            assert.equal(status, true);
            status = await tokensale.whitelist.call(client2);
            assert.equal(status, true);
            await tokensale.sendTransaction({
                from: client1,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal1 = (await token.balanceOf(client1)).toNumber();
            assert.equal(bal1, ether_amount * initialRate * microDVZ);
            await tokensale.sendTransaction({
                from: client2,
                value: web3.toWei(ether_amount + 5, "ether"),
                gas: 1000000
            });
            const bal2 = (await token.balanceOf(client2)).toNumber();
            assert.equal(bal2, (ether_amount + 5) * initialRate * microDVZ);
        });
    });
})();