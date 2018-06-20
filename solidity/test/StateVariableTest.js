(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DeviseTokenSale = artifacts.require("./DeviseTokenSale");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
    const assertRevert = require('./helpers/assertRevert');
    const strategies = require('./strategies');

    const pitai = web3.eth.accounts[0];
    const tokenWallet = web3.eth.accounts[1];
    const escrowWallet = web3.eth.accounts[2];
    const revenueWallet = web3.eth.accounts[3];
    const clients = web3.eth.accounts.slice(4);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    let token;
    let tokensale;
    let rentalProxy;

    async function findEvent(Tx, eventName) {
        const len = Tx.logs.length;
        for (let i = 0; i < len; i++) {
            if (Tx.logs[i].event == eventName) {
                return i;
            }
        }
        return NaN;
    }

    contract("Test token related state variables", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
        });

        it("The cap should be 10 billion DVZ", async () => {
            const token_cap = await token.cap.call();
            assert.equal(token_cap, cap);
        });
    });

    contract("Test token sale related state variables", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});
            // 07/01/2018 12:00:00am
            const openingTime = 1530403200;
            // 10/01/2018 12:00:00am
            const closingTime = 1538352000;
            tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
        });

        it("The initial rate should be 16000 DVZ", async () => {
            const initRate = await tokensale.initialRate.call();
            assert.equal(initRate.toNumber(), initialRate.toNumber());
        });

        it("The final rate should be 8000 DVZ", async () => {
            const finRate = await tokensale.finalRate.call();
            assert.equal(finRate.toNumber(), finalRate.toNumber());
        });
    });

    contract("Test rental related state variables", () => {
        const client = clients[0];

        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: pitai});
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
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
        });

        describe("LeaseAll related tests", () => {
            beforeEach(async () => {
                const ether_amount = 1000;
                await tokensale.sendTransaction({
                    from: client,
                    value: web3.toWei(ether_amount, "ether"),
                    gas: 1000000
                });
                const dvz_amount = await token.balanceOf(client);
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});
            });

            it("LeaseAll should fail if price per bit is less than 1000 DVZ", async () => {
                await assertRevert(rentalProxy.leaseAll(800 * 10 ** 6, 1, {from: client}));
            });

            it("LeaseAll should pass if price per bit is greater than 1000 DVZ", async () => {
                await rentalProxy.leaseAll(5000 * 10 ** 6, 1, {from: client});
                const bidder = await rentalProxy.getHighestBidder.call();
                assert.equal(bidder[0], client);
            });

            it("LeaseAll should return false if seats are set to zero", async () => {
                const tx = await rentalProxy.leaseAll(5000 * 10 ** 6, 0, {from: client});
                let i = await findEvent(tx, "Leased");
                assert.isFalse(tx.logs[i].args.status);
                i = await findEvent(tx, "BidCanceled");
                assert.equal(tx.logs[i].args.client, client);
                const bidder = await rentalProxy.getHighestBidder.call();
                assert.equal(bidder[0], "0x0000000000000000000000000000000000000000");
            });

            it("Total seats per address should be 100", async () => {
                const before = await rentalProxy.seatsAvailable.call();
                assert.isAbove(before, 0);
                await rentalProxy.leaseAll(5000 * 10 ** 6, 100, {from: client});
                const after = (await rentalProxy.seatsAvailable.call()).toNumber();
                assert.equal(after, 0);
            });
        });

        it("Should not change the bid tree if a client's first bid with seats set to zero", async () => {
            const client1 = clients[1];
            const amt = 1000;
            await tokensale.sendTransaction({from: client1, value: web3.toWei(amt, "ether")});
            const dvz_amount = await token.balanceOf(client1);
            await token.approve(rentalProxy.address, dvz_amount, {from: client1});
            await rentalProxy.provision(dvz_amount, {from: client1});
            const bidder1 = await rentalProxy.getHighestBidder.call();
            assert.equal(bidder1[0], "0x0000000000000000000000000000000000000000");
            await rentalProxy.leaseAll(5000 * 10 ** 6, 0, {from: client1});
            const bidder2 = await rentalProxy.getHighestBidder.call();
            assert.equal(bidder2[0], "0x0000000000000000000000000000000000000000");
        });

        it("The token precision should be micro DVZ", async () => {
            const client1 = clients[1];
            const client2 = clients[2];
            const amt1 = 10 ** 8;
            const amt2 = 12 * 10 ** 7;
            await tokensale.sendTransaction({from: client1, value: web3.toWei(amt1, "wei")});
            await tokensale.sendTransaction({from: client2, value: web3.toWei(amt2, "wei")});
            const bal1 = (await token.balanceOf.call(client1)).toNumber();
            const bal2 = (await token.balanceOf.call(client2)).toNumber();
            assert.equal(bal1, bal2);
        });

        it("Total seats should be 100", async () => {
            const seats = (await rentalProxy.totalSeats.call()).toNumber();
            assert.equal(seats, 100);
        });

        it("Total seats should be settable", async () => {
            const new_seats = 200;
            await rentalProxy.setTotalSeats(new_seats);
            const seats = (await rentalProxy.totalSeats.call()).toNumber();
            assert.equal(seats, new_seats);
        });

    });

    contract("Test power user", () => {
        const client = clients[0];

        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: pitai});
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
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
        });

        it("The power user application should pass if the client has 1M tokens", async () => {
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isTrue(status);
        });

        it("The power user application should fail if the client has less than 1M tokens", async () => {
            const ether_amount = 10;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isBelow(dvz_amount, millionDVZ * microDVZ);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isFalse(status);
        });

        it("Power user status should not change simply because more strategies are added", async () => {
            const ether_amount = 70;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isTrue(status);
            // Pit.AI adds strategies to rental contract
            await rentalProxy.addStrategy(strategies[0], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[1], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[2], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[3], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[4], 1000000 * (100));
            await rentalProxy.addStrategy(strategies[5], 1000000 * (100));
            const pumin = (await rentalProxy.getPowerUserMinimum.call()).toNumber() / microDVZ;
            assert.isAbove(pumin, 10 ** 6);
            assert.isAbove(pumin, dvz_amount / microDVZ);
            const status1 = await rentalProxy.isPowerUser.call({from: client});
            assert.isTrue(status1);
        });

        it("Power user application will fail when a client's tokens higher then init, but lower than updated", async () => {
            const ether_amount = 70;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            // Pit.AI adds strategies to rental contract
            await rentalProxy.addStrategy(strategies[0], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[1], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[2], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[3], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[4], 1000000 * (100));
            await rentalProxy.addStrategy(strategies[5], 1000000 * (100));
            const pumin = (await rentalProxy.getPowerUserMinimum.call()).toNumber() / microDVZ;
            assert.isAbove(pumin, 10 ** 6);
            assert.isAbove(pumin, dvz_amount / microDVZ);
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isFalse(status);
        });

        it("The power user club fee should be zero", async () => {
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            const before = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isTrue(status);
            const after = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after);
        });

        it("The power user club fee can be set", async () => {
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            const before = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            const fee = 5 * microDVZ;
            await rentalProxy.setPowerUserClubFee(fee, {from: pitai});
            await rentalProxy.applyForPowerUser({from: client});
            const status = await rentalProxy.isPowerUser.call({from: client});
            assert.isTrue(status);
            const after = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after + fee);
        });

        it("Historical data fee should be zero", async () => {
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            const before = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            await rentalProxy.requestHistoricalData({from: client});
            const status = await rentalProxy.getClientSummary.call(client);
            assert.isTrue(status[4]);
            const after = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after);
        });

        it("Historical data fee can be set", async () => {
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            const before = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            const fee = 5 * microDVZ;
            await rentalProxy.setHistoricalDataFee(fee, {from: pitai});
            await rentalProxy.requestHistoricalData({from: client});
            const status = await rentalProxy.getClientSummary.call(client);
            assert.isTrue(status[4]);
            const after = (await rentalProxy.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after + fee);
        });
    });

    contract("Test total seats per address", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: pitai});
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
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
        });

        it("Total seats per address should be settable", async () => {
            const client = clients[0];
            const ether_amount = 1000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
            const dvz_amount = await token.balanceOf(client);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});
            await rentalProxy.setMaxSeatPercentage(10);
            const before = await rentalProxy.seatsAvailable.call();
            assert.equal(before, 100);
            await rentalProxy.leaseAll(5000 * 10 ** 6, 100, {from: client});
            const after = (await rentalProxy.seatsAvailable.call()).toNumber();
            assert.equal(after, 90);
        });

    });

    contract("Bid precision related tests", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount, {from: pitai});
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
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
        });

        describe("Bid precision related test", async () => {
            const client1 = clients[0];
            const client2 = clients[1];

            beforeEach(async () => {
                const ether_amount = 1000;
                await tokensale.sendTransaction({
                    from: client1,
                    value: web3.toWei(ether_amount, "ether"),
                    gas: 1000000
                });
                const dvz_amount = await token.balanceOf(client1);
                await token.approve(rentalProxy.address, dvz_amount, {from: client1});
                await rentalProxy.provision(dvz_amount, {from: client1});

                await tokensale.sendTransaction({
                    from: client2,
                    value: web3.toWei(ether_amount, "ether"),
                    gas: 1000000
                });
                await token.approve(rentalProxy.address, dvz_amount, {from: client2});
                await rentalProxy.provision(dvz_amount, {from: client2});
            });

            it("The bid precision should be micro DVZ", async () => {
                const bid1 = 5000 * 10 ** 6 + 1;
                const bid2 = 5000 * 10 ** 6 + 2;
                await rentalProxy.leaseAll(bid1, 1, {from: client1});
                await rentalProxy.leaseAll(bid2, 1, {from: client2});
                [addr, _, h1] = await rentalProxy.getHighestBidder.call();
                assert.equal(h1.toNumber(), bid2);
                [_, _, h2] = await rentalProxy.getNextHighestBidder.call(addr);
                assert.equal(h2.toNumber(), bid1);
            });
        });

    });
})();