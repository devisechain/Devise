(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
    const leptons = require('./leptons');
    const {timeTravel, evmSnapshot, evmRevert, timestampToDate} = require('./test-utils');
    const moment = require('moment');

    const pitai = web3.eth.accounts[0];
    const tokenOwner = web3.eth.accounts[1];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(4);
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;
    const IUDecimals = 10 ** 6;

    let token;
    let tokensale;
    let rentalProxy;

    async function getProratedDues(seats, iu, prc) {
        // mimic the price calculation used in solidity
        const price = iu * prc * seats;
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        return Math.floor((price / daysInMonth) * (daysInMonth - (moment(d).utc().date() - 1)));
    }

    async function getNumberOfBidders(rentalProxy) {
        let count = 0;
        let bidder = await rentalProxy.getHighestBidder.call();
        while (bidder[0] != '0x0000000000000000000000000000000000000000') {
            count++;
            const addr = bidder[0];
            try {
                bidder = await rentalProxy.getNextHighestBidder.call(addr);
            } catch (error) {
                break;
            }
        }
        return count;
    }

    contract("Test inaugural lease term charges", () => {
        beforeEach(async () => {
            token = await DeviseToken.new(cap, {from: pitai});

            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 30 * 24 * 60 * 60;
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
            await rentalProxy.setEscrowWallet(escrowWallet);
            await rentalProxy.setRevenueWallet(revenueWallet);
        });

        it("Should charge the client for the inaugural lease term", async () => {
            await rentalProxy.addLepton(leptons[0], IUDecimals * (3));
            const client = clients[0];
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
            const dvz_amount = await token.balanceOf(client);
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});

            const before = (await rentalProxy.getAllowance({from: client})).toNumber();
            const seats = 1;
            await rentalProxy.leaseAll(5000 * microDVZ, seats, {from: client});
            const n = await getNumberOfBidders(rentalProxy);
            assert.isAbove(n, 0);
            const after = (await rentalProxy.getAllowance({from: client})).toNumber();
            assert.isAbove(before, after);
            const iu = (await rentalProxy.totalIncrementalUsefulness.call()).toNumber() / IUDecimals;
            const prc = (await rentalProxy.minimumPricePerBit.call()).toNumber();
            const currPrc = (await rentalProxy.getRentPerSeatCurrentTerm.call()).toNumber();
            assert.equal(currPrc, iu * prc);
            const charge = await getProratedDues(seats, iu, prc);
            assert.equal(before - after, charge);
        });

        describe("Test the contract behavior when a client does not have enough token to honor his bid", () => {
            const client = clients[0];

            beforeEach(async () => {
                await Promise.all(leptons.map(async lepton => await rentalProxy.addLepton(lepton, IUDecimals * (3))));
                // approve so to recognize revenue
                // 10 million tokens
                const rev_amount = 10 * millionDVZ * microDVZ;
                await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});

                // purchase a lot of tokens
                const ether_amount = 3000;
                await tokensale.sendTransaction({
                    from: client,
                    value: web3.toWei(ether_amount, "ether"),
                    gas: 1000000
                });
            });

            it("Should be charged for the minimum if the client can afford it", async () => {
                // provision a small amount of tokens
                let dvz_amount = 841 * 10 ** 3 * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});

                const iu = (await rentalProxy.totalIncrementalUsefulness.call()).toNumber() / IUDecimals;
                const bal0 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                const seats = 10;
                const prc_per_bit = 5000 * microDVZ;
                let charge = prc_per_bit * iu * seats;
                // confirm allowance is not enough to honor his bid
                assert.isBelow(bal0, charge);
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                const n0 = (await rentalProxy.getNumberOfRenters.call()).toNumber();
                // confirm the client becomes a renter
                assert.equal(n0, 1);
            });

            it("Should remain in the renter's list as long as the client can afford", async () => {
                // provision a small amount of tokens
                let dvz_amount = 841 * 10 ** 3 * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});

                const iu = (await rentalProxy.totalIncrementalUsefulness.call()).toNumber() / IUDecimals;
                const bal0 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                const seats = 10;
                const prc_per_bit = 5000 * microDVZ;
                let charge = prc_per_bit * iu * seats;
                // confirm allowance is not enough to honor his bid
                assert.isBelow(bal0, charge);
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                const n0 = (await rentalProxy.getNumberOfRenters.call()).toNumber();
                // confirm the client becomes a renter
                assert.equal(n0, 1);
                const bal1 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                await timeTravel(86400 * 31);
                // provision a lot more tokens
                dvz_amount = 10 * millionDVZ * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                charge = await getProratedDues(seats, iu, 10 ** 3 * microDVZ);
                const bal2 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                // confirm the full term is charged
                assert.equal(bal1 + dvz_amount, charge + bal2);
            });

            it("Should activate the client's bid if his allowance can afford", async () => {
                // provision a small amount of tokens
                let dvz_amount = 841 * 10 ** 3 * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});

                const iu = (await rentalProxy.totalIncrementalUsefulness.call()).toNumber() / IUDecimals;
                const bal0 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                const seats = 10;
                const prc_per_bit = 5000 * microDVZ;
                let charge = prc_per_bit * iu * seats;
                // confirm allowance is not enough to honor his bid
                assert.isBelow(bal0, charge);
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                const n0 = (await rentalProxy.getNumberOfRenters.call()).toNumber();
                // confirm the client becomes a renter
                assert.equal(n0, 1);
                const bal1 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                await timeTravel(86400 * 31);
                // provision a lot more tokens
                dvz_amount = 10 * millionDVZ * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                charge = await getProratedDues(seats, iu, 10 ** 3 * microDVZ);
                const bal2 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                // confirm the full term is charged
                assert.equal(bal1 + dvz_amount, charge + bal2);
                await timeTravel(86400 * 31);
                charge = prc_per_bit * iu * seats;
                assert.isAtLeast(bal2, charge);
                const bal3 = (await rentalProxy.getAllowance.call({from: client})).toNumber();
                const prc_sm = (await rentalProxy.getRentPerSeatCurrentTerm.call()).toNumber();
                // confirm auction price increases to the client's bid
                assert.equal(prc_sm, prc_per_bit * iu);
                // can charge either 1 term or 2 terms
                const gap = (bal2 == bal3 + charge) || (bal2 == bal3 + 2 * charge);
                assert.isTrue(gap);
            });

            it("Should be able to check price per bit", async () => {
                const minPrc = (await rentalProxy.minimumPricePerBit.call()).toNumber() / microDVZ;
                const prc = (await rentalProxy.getPricePerBitCurrentTerm.call()).toNumber() / microDVZ;
                assert.equal(prc, minPrc);

                const prcnext = (await rentalProxy.getIndicativePricePerBitNextTerm.call()).toNumber() / microDVZ;
                assert.equal(prcnext, minPrc);
            });

            it("Should return rent in the absence of bids", async () => {
                const n = await getNumberOfBidders(rentalProxy);
                assert.equal(n, 0);
                const IU = (await rentalProxy.getTotalIncrementalUsefulness.call()).toNumber() / IUDecimals;
                const rent = (await rentalProxy.getRentPerSeatCurrentTerm.call()).toNumber() / microDVZ;
                const prc = (await rentalProxy.getPricePerBitCurrentTerm.call()).toNumber() / microDVZ;
                assert.equal(rent, IU * prc);

                const rent1 = (await rentalProxy.getIndicativeRentPerSeatNextTerm.call()).toNumber() / microDVZ;
                const prcnext = (await rentalProxy.getIndicativePricePerBitNextTerm.call()).toNumber() / microDVZ;
                assert.equal(rent1, IU * prcnext);
            });

            it("Should be able to check price per bit after leaseAll() calls", async () => {
                let dvz_amount = 10841 * 10 ** 3 * microDVZ;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                await rentalProxy.provision(dvz_amount, {from: client});
                const seats = 10;
                const prcTokens = 5000;
                const prc_per_bit = prcTokens * microDVZ;
                await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
                const prcnext = (await rentalProxy.getIndicativePricePerBitNextTerm.call()).toNumber() / microDVZ;
                assert.equal(prcnext, prcTokens);
            });
        });
    });
})();