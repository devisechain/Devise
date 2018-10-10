/*eslint-env es6*/
/* global assert, artifacts, it, contract, web3*/

const setupFixturesHelper = require('./helpers/setupFixtures');
const crypto = require('crypto');
const DeviseRentalImplV2 = artifacts.require("./DeviseRentalImplV3");
const DeviseRentalImplTest = artifacts.require("./DeviseRentalImplTest");
const moment = require('moment');
const assertRevert = require('./helpers/assertRevert');
const {transferTokens} = require('./test-utils');

// parameters to be set by tests
// default: num_clients = 6
// default: num_st_blockchain = 1
let num_clients = 2;
let num_st_blockchain = 4;

let token;
let dateTime;
let rental_v2;
let rental;
let accountingProxy;
let rentalProxy_v2;
let proxy;
const pitai = web3.eth.accounts[0];
const tokenWallet = web3.eth.accounts[1];
const escrowWallet = web3.eth.accounts[2];
const revenueWallet = web3.eth.accounts[3];
// let num_fixed_clients = 6;
let available_accounts = web3.eth.accounts.length - 2;
let max_clients = num_clients > available_accounts ? available_accounts : num_clients;
let clients = web3.eth.accounts.slice(4, num_clients + 4);
// let num_leptons_per_round = 8;
let num_fixed_leptons = 4;
// let max_seats = 10;
let max_usefulness = 10000000;
// let min_lease_price = 100;
let num_leptons = 1;
// let num_rounds = Math.ceil(num_leptons / num_stretegies_per_round);
let ethPrice = 2000;
// gas price is 24 GWei
let gasPrice = 24;
let client1_bal;
let bids = [];
let seats = [];
let microDVZ = 10 ** 6;
let millionDVZ = 10 ** 6;

async function setupFixtures() {
    ({
        rental,
        proxy,
        token,
        dateTime,
        auctionProxy,
        accountingProxy
    } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));
    // plugin out test implementation with mock methods
    await proxy.upgradeTo((await DeviseRentalImplTest.new()).address);
    rental = DeviseRentalImplTest.at(proxy.address);
    await rental.addMasterNode(pitai);

    rentalProxy_v2 = await DeviseRentalImplV2.at(proxy.address);
    assert.equal(proxy.address, rental.address);
    assert.equal(proxy.address, rentalProxy_v2.address);
    rental_v2 = await DeviseRentalImplV2.new(token.address, dateTime.address);
}

function tokensaleTestAsArray(testTitle, i) {
    it(testTitle + (i + 1), function () {
        const ether_amount = 1000;
        return transferTokens(token, rental, tokenWallet, clients[i], ether_amount).then(async function (tx) {
            const currentRate = 16000;
            let gas = tx.receipt.gasUsed;
            console.log("Gas used: ", gas);
            let cost = gas * gasPrice * ethPrice / 10 ** 9;
            console.log("The gas cost to call tokensale is ", cost);
            return token.balanceOf(clients[i]).then(function (bal) {
                assert.equal(bal / microDVZ, ether_amount * currentRate, "Client's balance should not be zero.");
            });
        });
    });
}

async function approvalTestAsArray(testTitle, i) {
    return it(testTitle + (i + 1), async function () {
        // approve 10,000,000 DVZ
        const dvz_amount = 10 * millionDVZ * microDVZ;
        const tx = await token.approve(accountingProxy.address, dvz_amount, {from: clients[i]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call approve is ", cost);
        const allowance = await token.allowance(clients[i], accountingProxy.address);
        assert.equal(allowance.toNumber(), dvz_amount, "Allowance should be 1000000.");
    });
}

async function provisionTestAsArray(testTitle, i) {
    return it(testTitle + (i + 1), async function () {
        // provision 10,000,000 DVZ
        const dvz_amount = 10 * millionDVZ * microDVZ;
        const tx = await proxy.provision(dvz_amount, {from: clients[i]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call provision is ", cost);
        const bal = await proxy.getAllowance.call({from: clients[i]});
        assert.equal(bal.toNumber(), dvz_amount);
    });
}

async function designateBeneficiaryTestAsArray(testTitle, i) {
    return it(testTitle + (i + 1), async function () {
        await rental.getBeneficiary.call({from: clients[i]}).then(function (ben) {
            assert.equal(ben, clients[i]);
        });
        const tx = await proxy.designateBeneficiary(clients[clients.length - 1 - i], {from: clients[i]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call designateBeneficiary is ", cost);
        const ben = await proxy.getClientSummary.call(clients[i]);
        assert.equal(ben[0], clients[clients.length - 1 - i]);
        assert.equal(ben.length, 7);
        return rental.getBeneficiary.call({from: clients[i]}).then(function (ben) {
            assert.equal(ben, clients[clients.length - 1 - i]);
        });
    });
}

function powerUserTestAsArray(testTitle, i) {
    it(testTitle, function () {
        return proxy.isPowerUser.call({from: clients[i]}).then(function (bal) {
            assert.equal(bal, true);
        });
    });
}

function getSha1Hash(i) {
    const hash = crypto.createHash('sha1');
    hash.update(i);
    return '0x' + hash.digest('hex');
}

let leptons = [];
let usefulnessSet = [];
let total_price = 0;
let min_price_per_bit = 1000;
let totalUsefulness = 0;

function addLeptonAsArray(testTitle, i) {
    it(testTitle + (i + 1), async function () {
        let str1 = leptons[i];
        const prevLepton = i > 0 ? leptons[i - 1] : '';
        let usefulness1 = usefulnessSet[i];
        const numLeptons = (await rental.getNumberOfLeptons()).toNumber();
        const tx = await rental.addLepton(str1, prevLepton, usefulness1, {from: pitai});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call addLepton is ", cost);
        const price = await rental.getIndicativeRentPerSeatNextTerm.call();
        total_price += min_price_per_bit * usefulness1;
        console.log("The usefulness is ", usefulness1);
        console.log("The next term price for the first month ", price.toNumber());
        assert.equal(price.toNumber(), total_price);
        const price2 = await rental.getIndicativeRentPerSeatNextTerm.call();
        assert.equal(price2.toNumber(), total_price);
        await rental.mockCurrentTotalUsefulness({from: pitai});
    });
}

let historicalDataPrice = 0;

function requestHistoricalDataAsArray(testTitle, i) {
    it(testTitle + (i + 1), async function () {
        const before = (await rental.getAllowance.call({from: clients[i]})).toNumber();
        const txid = await rental.requestHistoricalData({from: clients[i]});
        let gas = txid.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call requestHistoricalData is ", cost);
        if (i === 0) {
            const after = (await rental.getAllowance.call({from: clients[i]})).toNumber();
            assert.equal(after - before, historicalDataPrice);
        }
    });
}

// let toHexArray = tx => tx.split('').map(function (c) {
//     return c.charCodeAt(0);
// });

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max)) + 1;
}

function prorata() {
    let d = new Date(0);
    d.setUTCSeconds(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
    let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
    let dd = moment(d).utc().date();
    let pro_rata = (daysInMonth - (dd - 1)) / daysInMonth;
    console.log("The current date is ", dd);
    console.log("The number of days for the month is ", daysInMonth);
    return pro_rata;
}

let costs = [];
let seatsAvailable = 100;
let balMap = new Map();
let pro_rata;
let client_rental_m1 = [];

function leaseAsArray(testTitle, i, j) {
    it(testTitle + (i + 1), async function () {
        let bids_per_round = bids[i].slice(j);
        console.log("Client " + i, " bid ", bids_per_round);
        let seats_per_round = seats.slice(j);
        // approve so to recognize revenue
        // 10 million tokens
        const rev_amount = 10 * millionDVZ * microDVZ;
        await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});
        const txid = await rental.leaseAll(bids_per_round[0], seats_per_round[0], {from: clients[i]});
        console.log("Lease round " + (j + 1));
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        costs[i] += gas * gasPrice * ethPrice / 10 ** 9;
        seatsAvailable -= seats_per_round[0];
        if (txid["logs"][5] !== undefined)
            console.log(txid["logs"][5]["args"]["title"], txid["logs"][5]["args"]["addr"]);
        const bal = await rental.getAllowance.call({from: clients[i]});
        let ns = num_leptons;
        pro_rata = prorata();
        console.log("The price for the month is ", balMap.get(ns));
        client_rental_m1.push(Math.floor(balMap.get(ns) * min_price_per_bit * pro_rata));
        // provision 10,000,000 DVZ
        const dvz_amount = 10 * millionDVZ * microDVZ;
        let exp = dvz_amount - client_rental_m1[i];
        console.log(exp);
        if (seatsAvailable >= 0)
            assert.isAtMost(Math.abs(bal.toNumber() - exp), 1);
        else if (seatsAvailable < 0 && Math.abs(seatsAvailable) < seats_per_round[0]) {
            exp = dvz_amount - Math.floor(Math.floor((seats_per_round[0] - Math.abs(seatsAvailable)) * totalUsefulness / 1000000) * pro_rata);
            assert.isAtMost(Math.abs(bal.toNumber() - exp), 1);
        }
        else
            assert.equal(bal.toNumber(), dvz_amount);
        console.log(costs[i]);
    });
}

function updateGlobalState(testTitle) {
    it(testTitle, async function () {
        const txid = await rental.updateGlobalState({from: pitai});
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        console.log("Current term price is ", (await rental.getRentPerSeatCurrentTerm.call()).toNumber());
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call updateGlobalState is ", cost);
    });
}

// noinspection JSUnusedLocalSymbols
function getPricesNextTermAsArray(testTitle, i) {
    it(testTitle, function () {
        return rental.getIndicativeRentPerSeatNextTerm.call().then(function (price) {
            console.log("The price for the next term is ", price.toNumber());
        });
    });
}

contract("DeviseRentalStatic", () => {
    before(setupFixtures);

    // test case 0: check the initial balance for the revenue wallet
    it("The initial balance for the revenue wallet should be zero", async function () {
        const bal = (await token.balanceOf.call(revenueWallet)).toNumber();
        assert.equal(bal, 0);
    });

    // test case 1: Tokensale for client
    for (let i = 0; i < clients.length; i++) {
        tokensaleTestAsArray("Tokensale for client", i);
    }

    // test case 2: Devise Rental: approve token transfer by client
    (async function () {
        clients.map((client, i) => approvalTestAsArray("Devise Rental: approve token transfer by client", i));
    })();

    // test case 3: Devise Rental: provision tokens by client
    (async function () {
        await Promise.all(clients.map((client, i) => provisionTestAsArray("Devise Rental: provision tokens by client", i)));
    })();

    // test case 4: Devise Rental: designate beneficiary by client
    (async function () {
        await Promise.all(clients.map((client, i) => designateBeneficiaryTestAsArray("Devise Rental: designate beneficiary by client", i)));
    })();

    // test case 5: Devise Rental: is the client a power user
    for (let i = 0; i < clients.length; i++) {
        powerUserTestAsArray("Devise Rental: is the client" + (i + 1) + " a power user", i);
    }

    // test case 6: Devise Rental: apply for power user status by client1
    let clubFee = 0;
    it("Devise Rental: apply for power user status by client1", async () => {
        const initialBalance = (await rental.getAllowance({from: clients[0]})).toNumber();
        const tx = await rental.applyForPowerUser({from: clients[0]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call applyForPowerUser is ", cost);
        const newBalance = (await rental.getAllowance({from: clients[0]})).toNumber();
        assert.equal(initialBalance - newBalance, clubFee);
        assert.equal(await rental.isPowerUser({from: clients[0]}), true);
    });

    // test case 7: Devise Rental: add lepton and get total usefulness
    for (let i = 0; i < num_st_blockchain; i++) {
        leptons.push(getSha1Hash(i.toString()));
        usefulnessSet.push(getRandomInt(max_usefulness));
        totalUsefulness += usefulnessSet[i];
    }

    let testTitle = "Devise Rental: add lepton ";
    for (let i = 0; i < leptons.length; i++) {
        addLeptonAsArray(testTitle, i);
    }

    // IMPORTANT: addLepton does not change usefulness for current term, only next term.
    it("Devise Rental: PriceCurrentTerm is based on correct usefulness", async () => {
        const priceCur = await rental.getRentPerSeatCurrentTerm();
        const priceNext = await rental.getIndicativeRentPerSeatNextTerm();
        assert.isAbove(priceCur.toNumber(), 0);
        assert.isAbove(priceNext.toNumber(), 0);
    });

    it("Devise Rental: get total usefulness", function () {
        return proxy.getTotalIncrementalUsefulness.call().then(function (result) {
            let tot = result.toNumber();
            assert.equal(tot, Math.floor(totalUsefulness));
        });
    });

    // test case 8: Devise Rental: request historical data by client
    let hdMax = 2 < clients.length ? 2 : clients.length;
    for (let i = 0; i < hdMax; i++) {
        requestHistoricalDataAsArray("Devise Rental: request historical data by client", i);
    }

    // test case 9: Devise Rental: lease leptons by client
    seats = [9];
    let bid1 = [9 * 10 ** 3 * microDVZ];
    let bid2 = [6 * 10 ** 3 * microDVZ];
    let bid3 = [7 * 10 ** 3 * microDVZ];
    let bid4 = [4 * 10 ** 3 * microDVZ];
    let bid5 = [2 * 10 ** 3 * microDVZ];
    let bid6 = [8 * 10 ** 3 * microDVZ];
    bids = [bid1, bid2, bid3, bid4, bid5, bid6];
    for (let i = 0; i < max_clients - num_fixed_leptons; i++) {
        let bid = [];
        let ran_bid = getRandomInt(90) + min_price_per_bit;
        bid.push(ran_bid);
        bids.push(bid);
    }
    balMap.set(1, seats[0] * totalUsefulness);
    for (let i = 0; i < clients.length; i++) {
        costs.push(0);
    }

    for (let i = 0; i < clients.length; i++) {
        leaseAsArray("Devise Rental: lease leptons by client", i, 0);
    }

    // test case 10: Devise Rental: calculate lepton prices for next term
    updateGlobalState("Devise Rental: calculate lepton prices for next term");

    // test case 11: Devise Rental: get lepton price for next term
    getPricesNextTermAsArray("Devise Rental: get lepton " + 1 + " price for next term", 0);

    // test case 12: Devise Rental: withdraw by client1
    it("Devise Rental: withdraw by client1", async function () {
        await token.approve(accountingProxy.address, 100000 * microDVZ, {from: escrowWallet});
        const tx = await rental.withdraw(5000 * microDVZ, {from: clients[0]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call withdraw is ", cost);
        const bal = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        // let ns = num_leptons > num_fixed_leptons ? num_fixed_leptons : num_leptons;
        console.log("The balance remaining after withdrawal ", bal);
        const dvz_amount = 10 * millionDVZ * microDVZ;
        assert.isAtMost(Math.abs(bal - (dvz_amount - client_rental_m1[0] - 5000 * microDVZ)), 1);
        client1_bal = bal;
    });

    // test case 19:
    describe('upgrade to version 2', function () {
        // No adding new functions without Proxy assembly
        it('test new function in version 2', async function () {
            await assertRevert(rentalProxy_v2.getAllowance_v2({from: clients[0]}));
            await proxy.upgradeTo(rental_v2.address, {from: pitai});
            const bal = await rentalProxy_v2.getAllowance_v2.call({from: clients[0]});
            assert.equal(bal.toNumber(), client1_bal);
        });
    });

    it("Can set usefulness baseline", async function () {
        const dec = 8;
        await rental.setUsefulnessBaseline(dec);
        const ret = (await rental.getUsefulnessBaseline.call()).toNumber();
        assert.equal(ret, 10 ** dec);
    });

    it("Can set minimum price per bit", async function () {
        await rental.setMinimumPricePerBit(76);
        const ret = (await rental.minimumPricePerBit.call()).toNumber();
        assert.equal(ret, 76);
    });

    it("Can set total seats", async function () {
        await rental.setTotalSeats(200);
        const ret = (await rental.totalSeats.call()).toNumber();
        assert.equal(ret, 200);
    });

    it("Can set max seat percentage", async function () {
        await rental.setMaxSeatPercentage(15);
        const ret = await rental.getMaxSeatPercentage.call();
        assert.equal(ret[0].toNumber(), 15);
        assert.equal(ret[1].toNumber(), 6);
    });

    it("The revenue wallet should have some balance", async function () {
        const bal = (await token.balanceOf.call(revenueWallet)).toNumber();
        assert.isAbove(bal, 0);
        console.log("The balance for the revenue wallet is ", bal);
    });
});

contract("DeviseRentalStatic2", () => {
    before(setupFixtures);

    it("Owner and the escrow wallet need to be different", async function () {
        await assertRevert(rental.setEscrowWallet(pitai, {from: pitai}));
    });

    it("The escrow wallet and revenue wallet should not be the same", async function () {
        await assertRevert(rental.setRevenueWallet(escrowWallet, {from: pitai}));
    });

    it("Can't set the escrow wallet and the revenue wallet from non owner account", async function () {
        await assertRevert(rental.setEscrowWallet(clients[0], {from: clients[0]}));
        await assertRevert(rental.setRevenueWallet(clients[0], {from: clients[0]}));
    });

    it('can set master node', async function () {
        await proxy.upgradeTo(rental_v2.address, {from: pitai});
        await rentalProxy_v2.setMasterNode(clients[0], {from: pitai});
    });

    it('master node can add lepton after upgrade', async function () {
        let str1 = leptons[0];
        let usefulness1 = usefulnessSet[0];
        const tx = await rentalProxy_v2.addLepton(str1, '', usefulness1, {from: clients[0]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call addLepton is ", cost);
    });

    it('owner cannot add lepton after upgrade', async function () {
        let str1 = leptons[0];
        let usefulness1 = usefulnessSet[0];
        await assertRevert(rentalProxy_v2.addLepton(str1, '', usefulness1, {from: pitai}));
    });

    it('The master node can add the same lepton twice', async function () {
        let str1 = leptons[0];
        let usefulness1 = usefulnessSet[0];
        await assertRevert(rentalProxy_v2.addLepton(str1, '', usefulness1, {from: clients[0]}));
    });
});

contract("DevseRentalStatic3", () => {
    before(setupFixtures);

    describe("Test the burnable feature", () => {
        it("Can burnable tokens", async () => {
            await transferTokens(token, rental, tokenWallet, pitai, 5);
            const bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.isAbove(bal, 0);
            await token.burn(10000, {from: pitai});
            const new_bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.equal(new_bal + 10000, bal);
        });

        it("Cannot burn more tokens than you have", async () => {
            await transferTokens(token, rental, tokenWallet, escrowWallet, .000005);
            const bal = (await token.balanceOf.call(escrowWallet)).toNumber();
            assert.isAbove(bal, 0);
            await assertRevert(token.burn(100000, {from: escrowWallet}));
        });
    });
});

contract("Minimum Lease Test", () => {
    before(setupFixtures);

    describe("Test minimum requirement for price per bit", () => {
        beforeEach(async () => {
            await transferTokens(token, rental, tokenWallet, clients[0], 4000);
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, dvz_amount, {from: clients[0]});
            await rental.provision(4 * millionDVZ * microDVZ, {from: clients[0]});
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});
        });

        it("Should pass if price is above 1000 DVZ", async () => {
            await rental.leaseAll(5000 * microDVZ, 9, {from: clients[0]});
        });

        it("Should fail if price is below 1000 DVZ", async () => {
            await assertRevert(rental.leaseAll(500 * microDVZ, 9, {from: clients[0]}));
        });
    });

});

contract("ETH/USD Rate Test", () => {
    const rate_decimals = 8;
    const rate_multiplier = 10 ** rate_decimals;
    describe("Test ETH/USD rate related functionality", () => {
        beforeEach(setupFixtures);
        it("Initial rate should be zero", async () => {
            const rate = await rental.rateETHUSD();
            assert.equal(0, rate);
        });

        it("Can set rate by rate setter", async () => {
            const myRate = 195.33 * rate_multiplier;
            const rateSetter = clients[0];
            await rental.addRateSetter(rateSetter, {from: pitai});
            await rental.setRateETHUSD(myRate, {from: rateSetter});
            const rate = await rental.rateETHUSD();
            assert.equal(myRate, rate);
        });

        it("Can not set rate by non-owner", async () => {
            const myRate = 201.56 * rate_multiplier;
            await assertRevert(rental.setRateETHUSD(myRate, {from: clients[1]}));
            const rate = await rental.rateETHUSD();
            assert.equal(0, rate);
        });

        it("Can add a rate setter", async () => {
            await rental.addRateSetter(clients[0], {from: pitai});
            const rateSetter = await rental.rateSetter.call();
            assert.equal(rateSetter, clients[0]);
        });

        it("Can remove a rate setter", async () => {
            await rental.addRateSetter(clients[0], {from: pitai});
            let rateSetter = await rental.rateSetter.call();
            assert.equal(rateSetter, clients[0]);
            await rental.removeRateSetter(clients[0], {from: pitai});
            rateSetter = await rental.rateSetter.call();
            assert.equal(rateSetter, 0x0);
        });
    });
});

const rate_setter = clients[0];
const rate_decimals = 8;
const rate_multiplier = 10 ** rate_decimals;

async function setupFixturesProvision() {
    await setupFixtures();
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    await token.approve(accountingProxy.address, saleAmount, {from: tokenWallet});
    await rental.addRateSetter(rate_setter, {from: pitai});
    const myRate = 201.56 * rate_multiplier;
    await rental.setRateETHUSD(myRate, {from: rate_setter});
    const rate = await rental.rateETHUSD.call();
    assert.equal(rate, myRate);
    await rental.setTokenWallet(tokenWallet, {from: pitai});
}

contract("ProvisonWithEther Tests", () => {
    beforeEach(setupFixturesProvision);

    it("ProvisionOnBehalfOf should increase client allowance", async () => {
        const client = clients[1];
        const balTokenSale = (await token.balanceOf(tokenWallet)).toNumber();
        await token.approve(accountingProxy.address, 1, {from: tokenWallet});
        await rental.provisionOnBehalfOf(client, 1, {from: tokenWallet});
        let bal = (await rental.getAllowance.call({from: client})).toNumber();
        const balTokenSaleAfter = (await token.balanceOf(tokenWallet)).toNumber();
        assert.equal(1, bal);
        assert.equal(balTokenSaleAfter, balTokenSale - 1);

        // Trying sending tokens from a different account to provision from
        await token.transfer(clients[0], 1 * 16000 * 1000000, {from: tokenWallet});

        // provision on behalf of client from clients[0]
        await token.approve(accountingProxy.address, 1000, {from: clients[0]});
        const balSender = (await token.balanceOf(clients[0])).toNumber();
        await rental.provisionOnBehalfOf(client, 1000, {from: clients[0]});
        bal = (await rental.getAllowance.call({from: client})).toNumber();
        const balSenderAfter = (await token.balanceOf(clients[0])).toNumber();
        assert.equal(1001, bal);
        assert.equal(balSender - 1000, balSenderAfter);
    });


    it("ProvisionWithEther should increase client allowance", async () => {
        const client = clients[1];
        await rental.provisionWithEther({from: client, value: web3.toWei(1, "ether"), gas: 1000000});
        let bal = await rental.getAllowance.call({from: client});
        bal = bal.toNumber();
        bal = bal / microDVZ;
        assert.equal(bal, 2015.6);
    });

    it("ProvisionWithEther should increase tokenWallet ether balance", async () => {
        const client = clients[1];
        const bal_before = (await web3.eth.getBalance(tokenWallet)).toNumber();
        const bal_gwei_before = bal_before % 10 ** 9;
        await rental.provisionWithEther({from: client, value: web3.toWei(1, "ether"), gas: 1000000});
        const bal = (await web3.eth.getBalance(tokenWallet)).toNumber();
        const bal_gwei = bal % 10 ** 9;
        console.log("The balance tail decimals are %d and %d", bal_gwei_before, bal_gwei);
        assert.closeTo(bal_before + 10 ** 18, bal, 200000000);
    });

    it("ProvisionWithEther should decrease tokenWallet DVZ balance", async () => {
        const client = clients[1];
        const bal_before = (await token.balanceOf.call(tokenWallet)).toNumber();
        await rental.provisionWithEther({from: client, value: web3.toWei(1, "ether"), gas: 1000000});
        const bal = (await token.balanceOf.call(tokenWallet)).toNumber();
        assert.equal(bal_before, bal + 2015600000);
    });

    it("ProvisionWithEther should fail if no ether amount specified", async () => {
        const client = clients[1];
        await assertRevert(rental.provisionWithEther({from: client, gas: 1000000}));
    });

    it("provision with small amount of ethers should pass", async () => {
        const client = clients[1];
        await rental.provisionWithEther({from: client, value: web3.toWei(0.0005, "ether"), gas: 1000000});
        let bal = await rental.getAllowance.call({from: client});
        bal = bal.toNumber();
        bal = bal / microDVZ;
        assert.equal(bal, 1.0078);
    });
});
