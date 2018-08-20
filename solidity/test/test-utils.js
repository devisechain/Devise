/**
 * Test Utilities including snapshotting, timeTravel, and custom asserts
 */

const toBigNumbers = (arr) => arr.map(num => isNaN(num) ? num : new web3.BigNumber(num));
const initAssertRevenueEquals = (token) => async function (expectedRevenue) {
    const rev = (await token.balanceOf(await this.revenueWallet.call())).toNumber();
    assert.equal(expectedRevenue, rev, "expectedRevenue: ");
};

const initAssertEscrowEquals = (token) => async function (expectedEscrow) {
    const escrow = (await token.balanceOf(await this.escrowWallet.call())).toNumber();
    assert.equal(expectedEscrow, escrow, "expectedEscrow: ");
};

const assertNumberOfClients = async function (expectedNumberOfClients) {
    const numberOfClients = (await this.getNumberOfClients.call()).toNumber();
    return assert.equal(expectedNumberOfClients, numberOfClients, "expectedClients: expectedNumberOfClients: ");
};

const assertClientsEqual = async function (expectedClients) {
    const allClients = (await this.getAllClients.call()).sort();
    return assert.deepEqual(expectedClients.sort(), allClients, "expectedClients: ");
};

const assertNumberOfRenters = async function (expectedNumberOfRenters) {
    const numberOfRenters = (await this.getNumberOfRenters.call()).toNumber();
    return assert.equal(expectedNumberOfRenters, numberOfRenters, "expectedRenters: getNumberOfRenters: ");
};

const assertRentersEqual = async function (expectedRenters) {
    assert.deepEqual(expectedRenters.sort(), (await this.getAllRenters.call()).sort(), "expectedRenters: ");
};

const assertBidsEqual = async function (expectedBids) {
    // We need to compare these bid trees exactly by the limit price but ignoring the order within each limit price group
    // in other words, 5 clients lease all at the same price, we care that the order of limit price is correct and that
    // each bidder has the right bid, but not that 2 clients with the same limit price are out of order.
    const newExpectedBids = [expectedBids[0], toBigNumbers(expectedBids[1]), toBigNumbers(expectedBids[2])];
    const bidders = await this.getAllBidders.call();

    assert.equal(expectedBids.length, 3, "expectedBids: should be an array containing 3 arrays");
    assert.equal(bidders.length, 3, "expectedBids: rental.getAllBidders should return an array containing 3 arrays");
    assert.equal(expectedBids[0].length, bidders[0].length, "expectedBids: Length of bidders addresses doesn't match!");
    assert.equal(expectedBids[1].length, bidders[1].length, "expectedBids: Length of seats array doesn't match!");
    assert.equal(expectedBids[2].length, bidders[2].length, "expectedBids: Length of limitPrice array doesn't match!");
    // assert that each client has the right seats and price in the contract
    const clientBidIdx = {};
    bidders[0].map((c, idx) => clientBidIdx[c] = idx);
    expectedBids[0].map((client, idx) => {
        const bidIdx = clientBidIdx[client];
        assert.equal(expectedBids[0][idx], bidders[0][bidIdx], "expectedBids: Client address not found in contract bids!"); // addresss
        assert.equal(expectedBids[1][idx], bidders[1][bidIdx].toNumber(), "expectedBids: Client seats mismatch vs contract bid!"); // seats
        assert.equal(expectedBids[2][idx], bidders[2][bidIdx].toNumber(), "expectedBids: Client limitPrice mismatch vs contract bid!"); // limitPrice
    });
    // assert the the limit price is in the order expected
    assert.deepEqual(newExpectedBids[2], bidders[2], "expectedBids: limit price order mismatch");
    // assert that the bids are sorted descending by order of limit price
    assert.deepEqual(bidders[2].sort(), bidders[2], "expectedBids: limit price not sorted properly");
};

const assertRentEquals = async function (expectedRent) {
    assert.equal(expectedRent, (await this.getRentPerSeatCurrentTerm.call()).toNumber(), "expectedRent: ");
};

const assertNextTermRentEquals = async function (expectedNextTermRent) {
    assert.equal(expectedNextTermRent, (await this.getIndicativeRentPerSeatNextTerm.call()).toNumber(), "expectedNextTermRent: ");
};

const assertClientBidsRespected = async function () {
    const allBids = await this.getAllBidders.call();
    const allRenters = await this.getAllRenters.call();
    allBids[0].map(async (client, idx) => {
        let bidSeats = allBids[1][idx].toNumber();
        let bidLimitPrice = allBids[2][idx].toNumber();
        const summary = await this.getClientSummary.call(client);
        const seatsAvailable = (await this.getSeatsAvailable.call()).toNumber();
        const price = (await this.getIndicativePricePerBitNextTerm.call()).toNumber();
        const rent = (await this.getRentPerSeatCurrentTerm.call()).toNumber();
        const allowance = summary[1].toNumber();
        const currentTermSeats = summary[6].toNumber();
        const nextTermSeats = summary[7].toNumber();
        // indicative term seats 0 or equals to bid seats
        assert(nextTermSeats === 0 || nextTermSeats === bidSeats);
        // indicative price per bit less than or equal bid limit price if next seats > 0
        assert(nextTermSeats === 0 || bidLimitPrice >= price, "Next term seats when limit price too low? ");
        // assert the renter paid for the current term
        assert(currentTermSeats === 0 || summary[3].toNumber() === (await this.getCurrentLeaseTerm.call()).toNumber());
        // if client has seats in the next term, assert he/she can pay for them
        if (nextTermSeats) {
            const nextRent = (await this.getIndicativeRentPerSeatNextTerm.call()).toNumber();
            assert.isAbove(allowance, rent * bidSeats);
        }
        // client must have seats in the current term under these conditions
        if (seatsAvailable >= bidSeats && bidLimitPrice >= price && allowance >= rent * bidSeats) {
            assert(currentTermSeats >= 0);
        }
    });
};

const assertSeatScarcityEnforced = async function () {
    const allClients = await this.getAllClients.call();
    let totalRentedSeats = 0;
    let nextTermTotalRentedSeats = 0;
    await Promise.all(allClients.map(async client => totalRentedSeats += (await this.getCurrentTermSeats.call({from: client})).toNumber()));
    await Promise.all(allClients.map(async client => nextTermTotalRentedSeats += (await this.getNextTermSeats.call({from: client})).toNumber()));
    assert.isBelow(totalRentedSeats, 100);
    assert.isBelow(nextTermTotalRentedSeats, 100);
};

const assertEscrowMatchesClientAllowances = async function (token) {
    const allClients = await this.getAllClients.call();
    const escrow = (await token.balanceOf(await this.escrowWallet.call())).toNumber();
    const allowances = await Promise.all(allClients.map(async client => (await this.getAllowance.call({from: client})).toNumber()));
    let sumAllowances = allowances.reduce((a, b) => a + b, 0);
    assert.equal(escrow, sumAllowances);
};

const assertPricePerBitAboveMinimum = async function () {
    assert((await this.getPricePerBitCurrentTerm.call()).toNumber() >= 1000 * 1000000);
    assert((await this.getIndicativePricePerBitNextTerm.call()).toNumber() >= 1000 * 1000000);
};

const assertPricePerBitNextTermMatchesRentPerSeatNextTerm = async function () {
    const totalIncrementalUsefulness = (await this.getTotalIncrementalUsefulness.call()).toNumber();
    const rentNextTerm = (await this.getIndicativeRentPerSeatNextTerm.call()).toNumber();
    const priceNextTerm = (await this.getIndicativePricePerBitNextTerm.call()).toNumber();
    assert.equal(rentNextTerm, priceNextTerm * (totalIncrementalUsefulness / 1000000));
};

const assertTotalIncrementalUsefulnessMatchesAllLeptons = async function () {
    const allLeptons = await this.getAllLeptons.call();
    const totalIncrementalUsefulness = (await this.getTotalIncrementalUsefulness.call()).toNumber();
    let calcIncrementalUsefulness = allLeptons[1].map(a => a.toNumber()).reduce((a, b) => a + b, 0);
    assert.equal(totalIncrementalUsefulness, calcIncrementalUsefulness)
};

const assertContractSanity = async function (token) {
    // Are we always abiding by clients constraints? E.g. Is the current (resp. next) price per bit ever higher than the limit price of any current (resp. next term) renter? Is there any client to whom we attributed a number of seats different (smaller or larger) than what he/she requested?
    await assertClientBidsRespected.bind(this)();
    // Are we always honoring what we promise to clients, especially enforcing scarcity? E.g. Is the total number of seats attributed to renters always at most the max number of seats?
    await assertSeatScarcityEnforced.bind(this)();
    // Do we have enough money in the escrow wallet to honor simultaneous withdrawal from all escrow accounts?
    await assertEscrowMatchesClientAllowances.bind(this)(token);
    // Is there any client who i) has a bid higher than the lowest renters' bid, ii) can honor his bid for number of seats requested, and iii) has not been chosen to be a renter next term?
    // @see DCS-339: Auction Logic: Limit price then time priority to determine seat allocation
    // await assertHighestBiddersHaveSeats.bind(this)();
    // Is the price per bit at least as high as the minimum specified in the contract?
    await assertPricePerBitAboveMinimum.bind(this)();
    // Is the rent calculated properly based on total IU and price per bit
    await assertPricePerBitNextTermMatchesRentPerSeatNextTerm.bind(this)();
    // Is the total incremental usefulness calculated properly
    await assertTotalIncrementalUsefulnessMatchesAllLeptons.bind(this)();
};

module.exports = {
    "timeTravel": async time => {
        await web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time], // 86400 is num seconds in day
            id: new Date().getTime()
        });
        await web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_mine",
            params: [],
            id: new Date().getTime()
        });
    },
    "evmSnapshot": async () => await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_snapshot",
        params: [],
        id: new Date().getTime(),
        "external": true
    }),
    "evmRevert": async (testSnapshotId) => await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_revert",
        params: [testSnapshotId],
        id: new Date().getTime(),
        "external": true
    }),
    "timestampToDate": timestamp => {
        const d = new Date(0);
        d.setUTCSeconds(timestamp);
        return d;
    },
    initAssertRevenueEquals: initAssertRevenueEquals,
    initAssertEscrowEquals: initAssertEscrowEquals,
    assertContractState: async function ({expectedEscrow, expectedRevenue, expectedClients, expectedRenters, expectedBids, expectedRent, expectedNextTermRent}) {
        // save the current pre-async stack trace
        const origStack = Error().stack.split('\n');
        const assertEscrowEquals = initAssertEscrowEquals(this._token).bind(this);
        const assertRevenueEquals = initAssertRevenueEquals(this._token).bind(this);
        try {
            // non input specific asserts
            await assertContractSanity.bind(this)(this._token);
            // assert that contract state matches input
            await assertEscrowEquals(expectedEscrow);
            await assertRevenueEquals(expectedRevenue);
            await assertNumberOfClients.bind(this)(expectedClients.length);
            await assertClientsEqual.bind(this)(expectedClients);
            await assertNumberOfRenters.bind(this)(expectedRenters.length);
            await assertRentersEqual.bind(this)(expectedRenters);
            await assertBidsEqual.bind(this)(expectedBids);
            await assertRentEquals.bind(this)(expectedRent);
            await assertNextTermRentEquals.bind(this)(expectedNextTermRent);
        } catch (e) {
            // enrich the async stack trace with the pre-async original call line number
            let stack = e.stack.split('\n');
            stack = stack.slice(0, stack.length - 2);
            stack.push('      ------------ async ---------------\n' + origStack[2]);
            e.stack = stack.join("\n");
            throw e;
        }
    }
};