(function () {

    const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
    const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImplTest");
    const DeviseToken = artifacts.require("./DeviseToken");
    const DateTime = artifacts.require("./DateTime");
    const moment = require('moment');
    const {timestampToDate} = require('./test-utils');
    const leptons = require('./leptons');
    const assertRevert = require('./helpers/assertRevert');

    const pitai = web3.eth.accounts[0];
    const pitaiWallet = web3.eth.accounts[1];
    const revenueWallet = web3.eth.accounts[2];
    const clients = web3.eth.accounts.slice(3);
    let token;
    let tokensale;
    let rental;
    let proxy;
    let estor;
    let microDVZ = 10 ** 6;
    let millionDVZ = 10 ** 6;

    async function setupFixtures() {
        // Setup all the contracts
        const cap = 10 * 10 ** 9 * 10 ** 6;
        token = await DeviseToken.new(cap, {from: pitai});
        const initialRate = new web3.BigNumber(16000);
        const finalRate = new web3.BigNumber(8000);
        const blockNumber = web3.eth.blockNumber;
        const openingTime = web3.eth.getBlock(blockNumber).timestamp;
        const closingTime = openingTime + 30 * 24 * 60 * 60;
        tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
        const tokenWallet = await tokensale.tokenWallet.call();
        // mint 1 billion tokens for token sale
        const saleAmount = 1 * 10 ** 9 * 10 ** 6;
        await token.mint(tokenWallet, saleAmount);
        await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
        dateTime = await DateTime.deployed();
        estor = await DeviseEternalStorage.new();
        // Create new upgradeable contract frontend (proxy)
        proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
        // Set it's implementation version
        await proxy.upgradeTo('1', (await DeviseRental_v1.new()).address);
        await tokensale.setRentalProxy(proxy.address);
        // Use implementation functions with proxy address
        rental = DeviseRental_v1.at(proxy.address);
        await rental.setEscrowWallet(pitaiWallet);
        await rental.setRevenueWallet(revenueWallet);

        const escrow_cap = 1000000000000000000 * microDVZ;
        await token.approve(rental.address, escrow_cap, {from: pitaiWallet});

        // test addLepton can't be called prior to authorize
        await assertRevert(rental.addLepton(leptons[0], 1000000 * (3)));
        await estor.authorize(proxy.address);
        // Pit.AI adds leptons to rental contract
        await rental.addLepton(leptons[0], 1000000 * (3));
        await rental.addLepton(leptons[1], 1000000 * (3));
        await rental.addLepton(leptons[2], 1000000 * (2));
        await rental.addLepton(leptons[3], 1000000 * (2));
        await rental.addLepton(leptons[4], 1000000 * (1));
        await rental.addLepton(leptons[5], 1000000 * (1));
        // Some clients buy tokens and approve transfer to rental contract
        const ether_amount = 3000;
        await Promise.all(clients.map(async client => {
            const bal = (await web3.eth.getBalance(client)).toNumber();
            assert.isAbove(bal, web3.toWei(ether_amount, "ether"));
            const rem = (await tokensale.remainingTokens.call()).toNumber();
            assert.isAbove(rem, ether_amount * initialRate * microDVZ);
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });
        }));
        await Promise.all(clients.map(async client => await token.approve(rental.address, 30 * millionDVZ * microDVZ, {from: client})));
    }

    async function getProratedDues(seats) {
        // mimic the price calculation used in solidity
        const price = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() * seats;
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        return Math.floor((price / daysInMonth) * (daysInMonth - (moment(d).utc().date() - 1)));
    }

    contract("UpdateLeaseTermsStatic", function () {
        // before running all tests, setup fixtures
        before(setupFixtures);
        // reset to our fixtures state after each test
        afterEach(async () => {
        });


        it.skip("getClientSummary returns correct information when contract stale", async () => {
            const client = clients[0];
            await rental.provision(10000, {from: client});
            await rental.applyForPowerUser({from: client});

            const clientInfo1 = await rental.getClientSummary(client);
            assert.equal(clientInfo1[0], client); // beneficiary
            assert.equal(clientInfo1[1].toNumber(), client_provision);  // escrow balance
            const tokenBalance = (await token.balanceOf(client)).toNumber();
            assert.equal(clientInfo1[2].toNumber(), tokenBalance);  // token balance
            assert.equal(clientInfo1[3].toNumber(), 0); // leaseTermPaid should be 0, none paid ever
            assert.equal(clientInfo1[4], true); // power user
            assert.equal(clientInfo1[5], false); // historical data access
            assert.equal(clientInfo1[6].toNumber(), 0); // currentTermSeats
            assert.equal(clientInfo1[7].toNumber(), 0); // indicativeNextTermSeats

            // test leaseAll can't be called if unauthorized
            await estor.unauthorize(proxy.address);
            await assertRevert(rental.leaseAll(10000, 10, {from: client}));
            await estor.authorize(proxy.address);

            await rental.leaseAll(10000, 10, {from: client});
            await rental.leaseAll(10000, 10, {from: client});
            await rental.leaseAll(10000, 10, {from: client});
            const dues = await getProratedDues(10);
            const clientInfo2 = await rental.getClientSummary(client);
            assert.equal(clientInfo2[0], client);
            assert.equal(clientInfo2[1].toNumber(), client_provision - dues); // escrow balance
            assert.equal(clientInfo2[2].toNumber(), tokenBalance);
            assert.equal(clientInfo2[4], false); // client fell behind power user minimum
            assert.equal(clientInfo2[5], false); // historical data access
            assert.equal(clientInfo2[6].toNumber(), 10); // currentTermSeats
            assert.equal(clientInfo2[7].toNumber(), 10); // indicativeNextTermSeats
        });

        it.skip("Provision updates allowance", async () => {
            const client = clients[0];
            assert.equal(await rental.getAllowance.call({from: client}), 0);
            // client provisions balance in rental contract
            await rental.provision(1000000, {from: client});
            // balance should now be up to date
            assert.equal(await rental.getAllowance.call({from: client}), 1000000);
            // client provisions balance in rental contract
            await rental.provision(1000000, {from: client});
            // balance should now be up to date
            assert.equal(await rental.getAllowance.call({from: client}), 2000000);
        });

        it.skip("Provision should update lease terms before increasing allowance", async () => {
            const client = clients[0];
            assert.equal(await rental.getAllowance.call({from: client}), 0);
            // client provisions balance in rental contract and leases
            const dues = await getProratedDues(10);
            await rental.provision(300, {from: client});
            await rental.leaseAll(200, 10, {from: client});
            const allowance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(allowance, 300 - dues);
            // cancel lease for future months
            await rental.leaseAll(200, 0, {from: client});
            // time passes, move forward 6 months
            await timeTravel(86400 * 6 * 30);
            await rental.provision(200, {from: client});
            // we should only have gotten charged for the 1 term
            const currentBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(currentBalance, 500 - dues);
        });

        it.skip("getAllowance updates all previous lease terms when contract state stale for 6 months", async () => {
            const client = clients[0];
            const initialAllowance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(initialAllowance, 0);
            // client provisions balance in rental contract and calls leaseAll
            await rental.provision(100000000, {from: client});
            const postProvisionBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(postProvisionBalance, 100000000);
            // Lease 10 seats (should charge us first month's lease right away)
            await rental.leaseAll(10000, 10, {from: client});
            const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.isBelow(postLeaseBalance, postProvisionBalance);
            // we start with prorated dues for the month in which we leased
            let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
            let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
            let dues = await getProratedDues(10);
            for (let i = 0; i < 6; i++) {
                const balance = (await rental.getAllowance.call({from: client})).toNumber();
                // Add monthly dues every month after lease month
                if (i > 0) {
                    const price = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() * 10;
                    dues += Math.floor(price);
                }
                // should equal original bal minus dues so far
                assert.equal(balance, postProvisionBalance - dues);
                // time passes (~1 months)
                const randomDay = Math.floor(Math.random() * Math.floor(28));
                await timeTravel(86400 * (randomDay + 1 + daysInMonth - d.getDate()));
                d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
                daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
            }
        });

        it.skip("leaseAll doesn't decrease allowance when seats not available", async () => {
            // Make sure we have enough clients in ganache to test this
            assert.isAbove(clients.length, 10);
            // First 10 clients get 10 seats each maxing out the lease term
            await Promise.all(clients.slice(0, 10).map(async client => {
                await rental.provision(1000000, {from: client});
                const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
                assert.equal(preLeaseBalance, 1000000);
                await rental.leaseAll(10000, 10, {from: client});
                const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
                assert.isBelow(postLeaseBalance, preLeaseBalance);
            }));
            // this is the client that won't be charged since she can't get seats
            const client = clients[11];
            await rental.provision(1000000, {from: client});
            const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            await rental.leaseAll(10000, 10, {from: client});
            const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(preLeaseBalance, postLeaseBalance);
        });

        it.skip("leaseAll checks if client has enough tokens to pay for lease", async () => {
            // First 5 clients get 10 seats each
            await Promise.all(clients.slice(0, 5).map(async client => {
                await rental.provision(1000000, {from: client});
                const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
                assert.equal(preLeaseBalance, 1000000);
                await rental.leaseAll(10000, 10, {from: client});
                const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
                assert.isBelow(postLeaseBalance, preLeaseBalance);
            }));
            // Next client doesn't provision enough so shouldn't get in
            const client = clients[5];
            await rental.provision(10, {from: client});
            const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(preLeaseBalance, 10);
            try {
                await rental.leaseAll(10000, 10, {from: client});
                assert.fail("Lease All didn't thrown when it should have");
            } catch (e) {
            }
            const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(postLeaseBalance, preLeaseBalance);
        });

        it.skip("Price goes up on second term with 1 bidder", async () => {
            const client = clients[0];
            await rental.provision(20000, {from: client});
            await rental.leaseAll(10000, 10, {from: client});
            assert((await rental.getRentPerSeatCurrentTerm.call()).toNumber(), 30);
            assert((await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber(), 300000);
        });

        it.skip("Price uses the right totalUsefulness for price calculations", async () => {
            // lease by first client
            const client1 = clients[0];
            await rental.provision(1000000, {from: client1});
            await rental.leaseAll(10000, 10, {from: client1});
            const client1Balance = (await rental.getAllowance.call({from: client1})).toNumber();

            // add a lepton to increse totalUsefulness, current term price stays the same, next term increases in price
            const priceMonth1 = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
            const usefulness = Math.floor((await rental.getTotalUsefulness()).toNumber() / 1000000);
            assert.equal((await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber(), priceMonth1);
            await rental.addLepton(leptons[6], 1000000 * (1));
            assert.equal(Math.floor((await rental.getTotalUsefulness()).toNumber() / 1000000), usefulness + 1);
            assert.equal((await rental.getRentPerSeatCurrentTerm.call()).toNumber(), priceMonth1);

            // lease by second client, should get charged the same as first client
            const client2 = clients[1];
            await rental.provision(1000000, {from: client2});
            await rental.leaseAll(10000, 10, {from: client2});
            const client2Balance = (await rental.getAllowance.call({from: client2})).toNumber();
            assert.equal(client1Balance, client2Balance);

            for (let i = 1; i <= 6; i++) {
                // time passes, move forward at least 1 month
                await timeTravel(86400 * (i * 31));
                // Current price should include new usefulness
                const client1BalanceMonth2 = (await rental.getAllowance.call({from: client1})).toNumber();
                const client2BalanceMonth2 = (await rental.getAllowance.call({from: client2})).toNumber();
                assert.equal(client1BalanceMonth2, client2BalanceMonth2);
            }
        });

        it.skip("updateLeaseTerms removes clients who run out of tokens", async () => {
            // First 5 clients get 10 seats each
            let numSeats = 100;
            const goodClients = clients.slice(0, 2);
            await Promise.all(goodClients.map(async client => {
                await rental.provision(1000000, {from: client});
                await rental.leaseAll(10000, 10, {from: client});
                numSeats -= 10;
            }));
            const numSeatsAvailable = (await rental.getSeatsAvailable.call()).toNumber();
            assert.equal(numSeatsAvailable, numSeats);

            // this client only provisions enough for 1 term
            const client = clients[2];
            let dues = await getProratedDues(10);
            await rental.provision(dues, {from: client});
            await rental.leaseAll(10000, 10, {from: client});
            assert.equal((await rental.getNumberOfRenters.call()).toNumber(), 3);
            assert.equal((await rental.getSeatsAvailable.call()).toNumber(), numSeats - 10);

            // Jump forward to next month
            let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
            let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
            await timeTravel(86400 * (1 + daysInMonth - d.getDate()));
            const numRenters = (await rental.getNumberOfRenters.call()).toNumber();
            assert.equal(numRenters, 2);
            const finalAvailableSeats = (await rental.getSeatsAvailable.call()).toNumber();
            assert.equal(finalAvailableSeats, numSeats);
            for (let i = 0; i < numRenters; i++) {
                const renter = await rental.getRenter.call(i);
                assert.include(goodClients, renter);
            }
        });

        it.skip("Withdraw decreases allowance", async () => {
            const client = clients[0];
            await rental.provision(10000, {from: client});
            const allowanceBeforeWithdraw = await rental.getAllowance.call({from: client});
            assert.equal(allowanceBeforeWithdraw, 10000);
            await rental.withdraw(100, {from: client});
            const allowanceAfterWithdraw = await rental.getAllowance.call({from: client});
            assert.equal(allowanceAfterWithdraw, 9900);
        });

        it.skip("getAllowance call() matches before and after updateLeaseTerm with contract stale for 6 months", async () => {
            const client = clients[0];
            // client provisions balance in rental contract and calls leaseAll
            await rental.provision(1000000, {from: client});
            await rental.leaseAll(10000, 10, {from: client});
            // time passes (~6 months)
            await timeTravel(86400 * 30 * 6);
            // client checks his own balance in a free call()
            const allowanceBeforeUpdate = await rental.getAllowance.call({from: client});
            // We make a transaction to update the contract's internal state
            await rental.updateLeaseTerms();
            // client checks his own balance in a free call()
            const allowanceAfterUpdate = await rental.getAllowance.call({from: client});
            assert.equal(allowanceBeforeUpdate.toNumber(), allowanceAfterUpdate.toNumber());
        });

        it.skip("Client loses power user privileges if token drops below minimum power user balance", async () => {
            const client = clients[0];
            await rental.provision(10000, {from: client});
            await rental.applyForPowerUser({from: client});
            assert.equal(await rental.isPowerUser.call({from: client}), true);
            await rental.withdraw(100, {from: client});
            const allowanceAfterWithdraw = await rental.getAllowance.call({from: client});
            assert.equal(allowanceAfterWithdraw, 9900);
            assert.equal(await rental.isPowerUser.call({from: client}), false);
        });

        it.skip("Cancelled leases do not count toward price", async () => {
            const provision_amount = 1000000 * microDVZ;
            const client_bid1 = 10000 * microDVZ;
            const client_bid2 = 6000 * microDVZ;
            await rental.provision(provision_amount, {from: clients[0]});
            await rental.provision(provision_amount, {from: clients[1]});
            await rental.provision(provision_amount, {from: clients[2]});
            await rental.leaseAll(client_bid1, 1, {from: clients[0]});
            await rental.leaseAll(client_bid1, 1, {from: clients[1]});
            await rental.leaseAll(client_bid2, 1, {from: clients[2]});
            const priceNextTerm = (await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber();
            const totalUsefulness = Math.floor((await rental.getTotalUsefulness()).toNumber() / 1000000);
            assert.equal(priceNextTerm, client_bid1 * totalUsefulness);
            await rental.leaseAll(client_bid1, 0, {from: clients[1]});
            const priceNextTerm2 = (await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber();
            assert.equal(priceNextTerm2, client_bid2 * totalUsefulness);
        });

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
            const secondClient = await rental.getHighestBidder.call();
            const firstClient = await rental.getNextHighestBidder.call(secondClient[0]);
            assert.equal(secondClient[0], client2);
            assert.equal(secondClient[1].toNumber(), 7);
            assert.equal(secondClient[2].toNumber(), client_bid2);
            assert.equal(firstClient[0], client1);
            assert.equal(firstClient[1].toNumber(), 5);
            assert.equal(firstClient[2].toNumber(), client_bid1);
        });

        it.skip("Retains the same information after upgrade", async () => {
            const DeviseRental_v2 = artifacts.require("./DeviseRentalImplV2");
            await rental.provision(10000, {from: clients[0]});
            await rental.provision(10000, {from: clients[1]});
            await rental.leaseAll(10, 5, {from: clients[0]});
            await rental.leaseAll(20, 7, {from: clients[1]});
            await timeTravel(86400 * 30 * 6);
            const priceCurrentTerm = (await rental.getRentPerSeatCurrentTerm()).toNumber();
            const proxy = DeviseRentalBase.at(rental.address);
            await proxy.upgradeTo('2.0', (await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
            const rental_v2 = DeviseRental_v2.at(rental.address);
            const priceCurrentTermPostUpgrade = (await rental_v2.getRentPerSeatCurrentTerm()).toNumber();
            assert.equal(priceCurrentTermPostUpgrade, priceCurrentTerm);
        });

        it("Can add new functions with upgrades", async () => {
            const DeviseRental_v2 = artifacts.require("./test/DeviseRentalImplV3");
            await rental.provision(10000, {from: clients[0]});
            const bal_v1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            // upgrade to v2
            const proxy = DeviseRentalBase.at(rental.address);
            await proxy.upgradeTo('2.0', (await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
            const rental_v2 = DeviseRental_v2.at(proxy.address);
            const bal_v2 = (await rental_v2.getAllowance_v2.call({from: clients[0]})).toNumber();
            assert.equal(bal_v1, bal_v2);
        });

        it.skip("Can change the implementation of existing functions", async () => {
            // upgrade to v2
            const DeviseRental_v2 = artifacts.require("./test/DeviseRentalImplV2");
            await proxy.upgradeTo('2.0', (await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
            const rental_v2 = DeviseRental_v2.at(proxy.address);
            await rental_v2.provision(10000, {from: clients[0]});
            const bal_v2 = (await rental_v2.getAllowance.call({from: clients[0]})).toNumber();
            assert.equal(bal_v2, 9998);
        });

        it("Cannot override the type of state variables with upgrades", async () => {
            const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
            await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
            const rental_v3 = DeviseRental_v3.at(proxy.address);
            // can't work without Proxy fallback assembly
            await rental_v3.setVersion(3, {from: pitai});
            const testString1 = await proxy.version.call({from: clients[0]});
            assert.equal(testString1, "2.0");
        });

        it.skip("Cannot override state variables with new same type variable in upgrades", async () => {
            const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
            await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
            const rental_v3 = DeviseRental_v3.at(proxy.address);
            const seats = (await rental.getSeatsAvailable.call({from: clients[0]})).toNumber();
            assert.equal(seats, 100);
            const seats2 = (await rental_v3.getSeatsAvailable.call({from: clients[0]})).toNumber();
            assert.equal(seats2, 100);
        });

        it("Only owner can upgrade contract", async () => {
            const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
            await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
            try {
                await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: pitai})).address, {from: clients[0]});
                expect.fail(null, null, "Only owner should be able to upgrade contract");
            } catch (e) {
            }
        });

        it.skip("Deducts the right power user fee", async () => {
            await rental.setPowerUserClubFee(10000, {from: pitai});
            await rental.provision(100000, {from: clients[0]});
            const bal1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            assert.equal(bal1, 100000);
            await rental.applyForPowerUser({from: clients[0]});
            const bal2 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            assert.equal(bal2, 100000 - 10000);
        });

        it.skip("Uses the right historical data fee", async () => {
            await rental.setHistoricalDataFee(10000, {from: pitai});
            await rental.provision(100000, {from: clients[0]});
            const bal1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            assert.equal(bal1, 100000);
            await rental.requestHistoricalData({from: clients[0]});
            const bal2 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
            assert.equal(bal2, 100000 - 10000);
        });

        it("Can list all leptons in the blockchain", async () => {
            const numLeptons = (await rental.getNumberOfLeptons.call()).toNumber();
            assert.equal(numLeptons, 6);
            for (let i = 0; i < numLeptons; i++) {
                const lepton = await rental.getLepton(i);
                assert.equal(lepton[1] + lepton[0], leptons[i]);
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