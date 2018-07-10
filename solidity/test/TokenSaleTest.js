(function () {
    const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
    const DeviseRental_v1 = artifacts.require("./DeviseRentalImpl");
    const leptons = require('./leptons');
    const assertRevert = require('./helpers/assertRevert');
    const {timeTravel, evmSnapshot, evmRevert, timestampToDate} = require('./test-utils');

    const num_clients = 20;
    const pitai = web3.eth.accounts[0];
    const escrowWallet = web3.eth.accounts[1];
    const revenueWallet = web3.eth.accounts[2];
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

    contract("Timed sale test", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            const dateTime = await DateTime.deployed();
            const estor = await DeviseEternalStorage.new();
            // Create new upgradeable contract frontend (proxy)
            proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
            // Set it's implementation version
            await proxy.upgradeTo('1', (await DeviseRental_v1.new()).address);
        });

        it("timed test, sale should fail before it starts", async () => {
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp + 6000;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
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

        it("timed test, sale should pass after it starts", async () => {
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});

            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(clients[0])).toNumber();
            assert.isAbove(bal, 0);
        });


        it("timed test, sale should fail after it closes", async () => {
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp - 30 * 24 * 60 * 60;
            const closingTime = web3.eth.getBlock(blockNumber).timestamp - 1;
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
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

    });

    contract("Increasing Price Test", () => {
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
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
        });

        it("Should buy at the initial rate at the opening time", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(clients[0])).toNumber();
            assert.equal(bal, ether_amount * initialRate * microDVZ);
        });

        it("Should buy at a lower rate after 10 days", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            await timeTravel(86400 * 10);
            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(clients[0])).toNumber();
            assert.isBelow(bal, ether_amount * initialRate * microDVZ);
        });

        it("Should buy at around the final rate at the closing time", async () => {
            const tokenWallet = await tokensale.tokenWallet.call();
            await timeTravel(86400 * 30 - 10);
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(clients[0])).toNumber();
            const ratio = bal / (ether_amount * finalRate * microDVZ);
            assert.isBelow(ratio, 1.001);
        });
    });

    contract("Allowance sale test", () => {
        let tokenWallet;

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
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
            tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
        });

        it("The token wallet initial balance should equal the total allocated sale amount", async () => {
            const bal_tw = await token.balanceOf(tokenWallet);
            assert.equal(saleAmount, bal_tw);
        });

        it("A tiny amount should fail", async () => {
            const ether_amount = 10 ** 6;
            await assertRevert(tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "wei"),
                gas: 1000000
            }));
        });

        it("The token wallet balance should decrease after a token sale", async () => {
            const eth_bal0 = Math.floor((await web3.eth.getBalance(tokenWallet)).toNumber() / 10 ** 18);
            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf(clients[0])).toNumber();
            const bal_tw = await token.balanceOf(tokenWallet);
            assert.equal(bal, saleAmount - bal_tw);
            const eth_bal1 = Math.floor((await web3.eth.getBalance(tokenWallet)).toNumber() / 10 ** 18);
            assert.equal(eth_bal0 + ether_amount, eth_bal1);
        });

        it("TokenWallet and wallet address should be the same", async () => {
            const w = await tokensale.wallet.call();
            const tw = await tokensale.tokenWallet.call();
            assert.equal(w, tw);
        });
    });

    contract("Minimum token purchase order test", () => {
        let tokenWallet;
        let rentalProxy;

        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const dateTime = await DateTime.deployed();
            const estor = await DeviseEternalStorage.new();
            // Create new upgradeable contract frontend (proxy)
            proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
            // Set it's implementation version
            await proxy.upgradeTo('1', (await DeviseRental_v1.new()).address);
            // rentalProxy will have all the interfaces of DeviseRentalImpl contract
            // future function calls are directly from rentalProxy
            rentalProxy = await DeviseRental_v1.at(proxy.address);
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
            await rentalProxy.addMasterNode(pitai);
            // Pit.AI adds leptons to rental contract
            // Given the setup, the minimum number of tokens to purchase is
            // 120,000 DVZ
            await estor.authorize(proxy.address);
            await rentalProxy.addLepton(leptons[0], '', 1000000 * (30));
            await rentalProxy.addLepton(leptons[1], leptons[0], 1000000 * (30));
            await rentalProxy.addLepton(leptons[2], leptons[1], 1000000 * (20));
            await rentalProxy.addLepton(leptons[3], leptons[2], 1000000 * (20));
            await rentalProxy.addLepton(leptons[4], leptons[3], 1000000 * (10));
            await rentalProxy.addLepton(leptons[5], leptons[4], 1000000 * (10));

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
            await tokensale.setRentalProxy(proxy.address);
            tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
        });

        it("Should fail if there is not enough ether to buy a minimum amount of tokens", async () => {
            const client = clients[0];
            // 1 ether can buy only 16,000 DZV, not enough
            const ether_amount = 1;
            const bal = (await web3.eth.getBalance(client)).toNumber();
            await assertRevert(tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            }));
            const bal1 = (await web3.eth.getBalance(client)).toNumber();
            // Less than 2 percent of ethers being spent on gas
            assert.isBelow(Math.abs(bal - bal1) / 10 ** 18, 0.02);
        });

        it("Should pass if one spends enough ethers to buy tokens", async () => {
            const client = clients[1];
            // 100 ethers can buy 1,600,000 DZV, should be enough
            const ether_amount = 100;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf.call(client)).toNumber() / microDVZ;
            assert.isAbove(bal, 1500000);
        });
    });
})();