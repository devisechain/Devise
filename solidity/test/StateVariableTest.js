(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const setupFixturesHelper = require('./helpers/setupFixtures');
    const assertRevert = require('./helpers/assertRevert');
    const {transferTokens} = require('./test-utils');
    const leptons = require('./leptons');

    const pitai = web3.eth.accounts[0];
    const tokenWallet = web3.eth.accounts[1];
    const escrowWallet = web3.eth.accounts[2];
    const revenueWallet = web3.eth.accounts[3];
    const clients = web3.eth.accounts.slice(4);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    let token;
    let rental;

    async function findEvent(Tx, eventName) {
        const len = Tx.logs.length;
        for (let i = 0; i < len; i++) {
            if (Tx.logs[i].event === eventName) {
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

    contract("Test rental related state variables", () => {
        const client = clients[0];

        beforeEach(async () => {
            ({
                rental,
                token,
                auctionProxy,
                accountingProxy
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, clients, true, false));
        });

        describe("LeaseAll related tests", () => {
            beforeEach(async () => {
                const ether_amount = 1000;
                await transferTokens(token, rental, tokenWallet, client, ether_amount);
                const dvz_amount = await token.balanceOf(client);
                await token.approve(accountingProxy.address, dvz_amount, {from: client});
                await rental.provision(dvz_amount, {from: client});
            });

            it("LeaseAll should fail if price per bit is less than 1000 DVZ", async () => {
                await assertRevert(rental.leaseAll(800 * 10 ** 6, 1, {from: client}));
            });

            it("LeaseAll should pass if price per bit is greater than 1000 DVZ", async () => {
                await rental.leaseAll(5000 * 10 ** 6, 1, {from: client});
                const bidder = await rental.getAllBidders.call();
                assert.equal(bidder[0][0], client);
            });

            it("LeaseAll should return false if seats are set to zero", async () => {
                const tx = await rental.leaseAll(5000 * 10 ** 6, 0, {from: client});
                i = await findEvent(tx, "BidCanceled");
                assert.equal(tx.logs[i].args.client, client);
                const bidder = await rental.getAllBidders.call();
                assert.equal(bidder[0].length, 0x0);
            });

            it("Total seats per address should be 100", async () => {
                const before = await rental.seatsAvailable.call();
                assert.isAbove(before, 0);
                await rental.leaseAll(5000 * 10 ** 6, 100, {from: client});
                const after = (await rental.seatsAvailable.call()).toNumber();
                assert.equal(after, 0);
            });
        });

        it("Should not change the bid tree if a client's first bid with seats set to zero", async () => {
            const client1 = clients[1];
            const amt = 1000;
            await transferTokens(token, rental, tokenWallet, client1, amt);
            const dvz_amount = await token.balanceOf(client1);
            await token.approve(accountingProxy.address, dvz_amount, {from: client1});
            await rental.provision(dvz_amount, {from: client1});
            const bidder1 = await rental.getAllBidders.call();
            assert.equal(bidder1[0].length, 0x0);
            await rental.leaseAll(5000 * 10 ** 6, 0, {from: client1});
            const bidder2 = await rental.getAllBidders.call();
            assert.equal(bidder2[0].length, 0x0);
        });

        it("The token precision should be micro DVZ", async () => {
            const client1 = clients[1];
            const client2 = clients[2];
            const amt1 = 10 ** 8;
            const amt2 = 12 * 10 ** 7;
            await transferTokens(token, rental, tokenWallet, client1, web3.fromWei(amt1, 'ether'));
            await transferTokens(token, rental, tokenWallet, client2, web3.fromWei(amt2, 'ether'));
            const bal1 = (await token.balanceOf.call(client1)).toNumber();
            const bal2 = (await token.balanceOf.call(client2)).toNumber();
            assert.equal(bal1, bal2);
        });

        it("Total seats should be 100", async () => {
            const seats = (await rental.totalSeats.call()).toNumber();
            assert.equal(seats, 100);
        });

        it("Total seats should be settable", async () => {
            const new_seats = 200;
            await rental.setTotalSeats(new_seats);
            const seats = (await rental.totalSeats.call()).toNumber();
            assert.equal(seats, new_seats);
        });

    });

    contract("Test power user", () => {
        const client = clients[0];

        beforeEach(async () => {
            ({
                rental: rental,
                token,
                auctionProxy,
                accountingProxy
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));
            await rental.addMasterNode(pitai);
        });

        it("The power user application should pass if the client has 1M tokens", async () => {
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isTrue(status);
        });

        it("The power user application should fail if the client has less than 1 month's rent in tokens", async () => {
            const ether_amount = 10;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isBelow(dvz_amount, millionDVZ * microDVZ);
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.addLepton(leptons[0], '', 1000000 * 10);
            const powerUserMin = (await rental.getPowerUserMinimum()).toNumber();
            const rentPerSeat = (await rental.getRentPerSeatCurrentTerm()).toNumber();
            const clientBalance = (await rental.getAllowance({from: client})).toNumber();
            const statusPre = await rental.isPowerUser.call({from: client});
            await rental.provision(powerUserMin - 1, {from: client});
            const clientBalance2 = (await rental.getAllowance({from: client})).toNumber();
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isFalse(status);
        });

        it("Power user status should not change simply because more leptons are added", async () => {
            const ether_amount = 70;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isTrue(status);
            // Pit.AI adds leptons to rental contract
            await rental.addLepton(leptons[0], '', 1000000 * (300));
            await rental.addLepton(leptons[1], leptons[0], 1000000 * (300));
            await rental.addLepton(leptons[2], leptons[1], 1000000 * (200));
            await rental.addLepton(leptons[3], leptons[2], 1000000 * (200));
            await rental.addLepton(leptons[4], leptons[3], 1000000 * (100));
            await rental.addLepton(leptons[5], leptons[4], 1000000 * (100));
            const pumin = (await rental.getPowerUserMinimum.call()).toNumber() / microDVZ;
            assert.isAbove(pumin, 10 ** 6);
            assert.isAbove(pumin, dvz_amount / microDVZ);
            const status1 = await rental.isPowerUser.call({from: client});
            assert.isTrue(status1);
        });

        it("Power user application will fail when a client's tokens higher then init, but lower than updated", async () => {
            await rental.setPowerUserClubFee(1, {from: pitai});
            const ether_amount = 70;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            assert.isAbove(dvz_amount, millionDVZ * microDVZ);
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            // add leptons to rental contract
            await rental.addLepton(leptons[0], '', 1000000 * 500);
            await rental.addLepton(leptons[1], leptons[0], 1000000 * 500);
            await rental.addLepton(leptons[2], leptons[1], 1000000 * 500);
            const pumin = (await rental.getPowerUserMinimum.call()).toNumber() / microDVZ;
            assert.isAbove(pumin, dvz_amount / microDVZ);
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isFalse(status);
        });

        it("The power user club fee should be zero", async () => {
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            const before = (await rental.getAllowance.call({from: client})).toNumber();
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isTrue(status);
            const after = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after);
        });

        it("The power user club fee can be set", async () => {
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(accountingProxy.address, dvz_amount, {from: client});

            const fee = 5 * microDVZ;
            await rental.setPowerUserClubFee(fee, {from: pitai});
            await rental.provision(dvz_amount, {from: client});
            const before = (await rental.getAllowance.call({from: client})).toNumber();
            await rental.applyForPowerUser({from: client});
            const status = await rental.isPowerUser.call({from: client});
            assert.isTrue(status);
            const after = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after + fee);
        });

        it("Historical data fee should be zero", async () => {
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            const before = (await rental.getAllowance.call({from: client})).toNumber();
            await rental.requestHistoricalData({from: client});
            const status = await rental.getClientSummary.call(client);
            assert.isTrue(status[4]);
            const after = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after);
        });

        it("Historical data fee can be set", async () => {
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = (await token.balanceOf(client)).toNumber();
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            const fee = 5 * microDVZ;
            await rental.setHistoricalDataFee(fee, {from: pitai});
            await rental.provision(dvz_amount, {from: client});
            const before = (await rental.getAllowance.call({from: client})).toNumber();
            await rental.requestHistoricalData({from: client});
            const status = await rental.getClientSummary.call(client);
            assert.isTrue(status[4]);
            const after = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(before, after + fee);
        });
    });

    contract("Test total seats per address", () => {
        beforeEach(async () => {
            ({
                rental: rental,
                token,
                auctionProxy,
                accountingProxy
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));
            await rental.addMasterNode(pitai);
        });

        it("Total seats per address should be settable", async () => {
            const client = clients[0];
            const ether_amount = 1000;
            await transferTokens(token, rental, tokenWallet, client, ether_amount);
            const dvz_amount = await token.balanceOf(client);
            await token.approve(accountingProxy.address, dvz_amount, {from: client});
            await rental.provision(dvz_amount, {from: client});
            await rental.setMaxSeatPercentage(10);
            const before = await rental.seatsAvailable.call();
            assert.equal(before, 100);
            await rental.leaseAll(5000 * 10 ** 6, 100, {from: client});
            const after = (await rental.seatsAvailable.call()).toNumber();
            assert.equal(after, 90);
        });

    });

    contract("Bid precision related tests", () => {
        beforeEach(async () => {
            ({
                rental: rental,
                token,
                accountingProxy
            } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));
        });

        describe("Bid precision related test", async () => {
            const client1 = clients[0];
            const client2 = clients[1];

            beforeEach(async () => {
                const ether_amount = 1000;
                await transferTokens(token, rental, tokenWallet, client1, ether_amount);

                const dvz_amount = await token.balanceOf(client1);
                await token.approve(accountingProxy.address, dvz_amount, {from: client1});
                await rental.provision(dvz_amount, {from: client1});

                await transferTokens(token, rental, tokenWallet, client2, ether_amount);

                await token.approve(accountingProxy.address, dvz_amount, {from: client2});
                await rental.provision(dvz_amount, {from: client2});
            });

            it("The bid precision should be micro DVZ", async () => {
                const bid1 = 5000 * 10 ** 6 + 1;
                const bid2 = 5000 * 10 ** 6 + 2;
                await rental.leaseAll(bid1, 1, {from: client1});
                await rental.leaseAll(bid2, 1, {from: client2});
                const bidders = await rental.getAllBidders.call();
                assert.equal(bidders[2][0].toNumber(), bid2);
                assert.equal(bidders[2][1].toNumber(), bid1);
            });
        });

    });
})();