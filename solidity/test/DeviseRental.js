/*eslint-env es6*/
/* global assert, artifacts, it, contract, web3*/

const crypto = require('crypto');
const setupFixturesHelper = require('./helpers/setupFixtures');
const DeviseRentalImplV2 = artifacts.require("./test/DeviseRentalImplV3");
const moment = require('moment');
const DateTime = artifacts.require("./DateTime");
const assertRevert = require('./helpers/assertRevert');
const {transferTokens, timestampToDate} = require('./test-utils');

// parameters to be set by tests
// default: num_clients = 6
// default: num_st_blockchain = 1
let num_clients = 20;
let num_st_blockchain = 4;

let token;
let rental_v2;
let rental;
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
let IUDecimal = 10 ** 6;
let max_usefulness = 10 * IUDecimal;
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

const timeTravel = function (time) {
    return new Promise((resolve, reject) =>
        web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time], // 86400 is num seconds in day
            id: new Date().getTime()
        }, (err, result) => err ? reject(err) : resolve(result)));
};

function tokensaleTestAsArray(testTitle, i) {
    // TODO replace with payable provision function test through rental contract
    it(testTitle + (i + 1), async function () {
        // TODO temporarily transferring tokens to clients from token sale wallet
        await transferTokens(token, rental, tokenWallet, clients[i], 1000);
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
        const allowance = (await token.allowance(clients[i], accountingProxy.address)).toNumber();
        assert.equal(allowance, dvz_amount, "Allowance should be 1000000.");
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
    it(testTitle, async () => {
        const isPowerUser = await proxy.isPowerUser.call({from: clients[i]});
        // any user with balance > indicative next term rent is a power user by default
        assert.equal(isPowerUser, true);
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
// minimum prive per bit, 1,000 DVZ
let min_price_per_bit = 1000;
let totalUsefulness = 0;

function addLeptonAsArray(testTitle, i) {
    it(testTitle + (i + 1), async function () {
        let str1 = leptons[i];
        const prevLepton = i > 0 ? leptons[i - 1] : '';
        let usefulness1 = usefulnessSet[i];
        const tx = await rental.addLepton(str1, prevLepton, usefulness1, {from: pitai});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call addLepton is ", cost);
        const price = (await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber();
        total_price += min_price_per_bit * usefulness1;
        console.log("The usefulness is ", usefulness1);
        console.log("The next term price for the first month ", price);
        assert.equal(price, total_price);
        const price2 = (await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber();
        assert.equal(price2, total_price);
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

async function getProratedDues(seats, extraMonths) {
    // mimic the price calculation used in solidity
    const price = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() * seats;
    let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
    let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
    const prorated = Math.floor((price / daysInMonth) * (daysInMonth - (moment(d).utc().date() - 1)));
    return extraMonths ? (price * extraMonths * seats) + prorated : prorated;
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
        const partial_seats = (await rental.getCurrentTermSeats.call({from: clients[i]})).toNumber();
        console.log("Lease round " + (j + 1));
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        costs[i] += gas * gasPrice * ethPrice / 10 ** 9;
        seatsAvailable -= partial_seats;
        if (txid["logs"][5] !== undefined)
            console.log(txid["logs"][5]["args"]["title"], txid["logs"][5]["args"]["addr"]);
        const bal = (await rental.getAllowance.call({from: clients[i]})).toNumber();
        let ns = num_leptons;
        pro_rata = prorata();
        console.log("The price for the month is ", balMap.get(ns));
        // client_rental_m1.push(Math.floor(balMap.get(ns) * pro_rata));
        client_rental_m1.push(Math.floor(balMap.get(ns) * min_price_per_bit * pro_rata));
        // provision 10,000,000 DVZ
        const dvz_amount = 10 * millionDVZ * microDVZ;
        let exp = dvz_amount - client_rental_m1[i];
        console.log(exp);
        if (partial_seats === seats_per_round[0]) {
            assert.isAtMost(Math.abs(bal - exp), 1);
        } else if (partial_seats > 0) {
            let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
            const daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
            const shouldPay = Math.floor(partial_seats * (min_price_per_bit * totalUsefulness / daysInMonth) * (daysInMonth - (moment(d).utc().date() - 1)));
            const paid = dvz_amount - bal;
            assert.equal(paid, shouldPay);
        } else {
            assert.equal(bal, dvz_amount);
        }

        console.log(costs[i]);
    });
}

function updateGlobalState(testTitle) {
    it(testTitle, async function () {
        await token.approve(accountingProxy.address, 100 * microDVZ, {from: escrowWallet});
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

async function isRenter(client) {
    const n = await rental.getNumberOfRenters.call();
    for (let i = 0; i < n; i++) {
        const renter = await rental.getRenter.call(i);
        if (renter === client)
            return true;
    }
    return false;
}

contract("DeviseRental", () => {
    before(async () => {
        ({
            rental,
            proxy,
            token,
            dateTime,
            auctionProxy,
            accountingProxy
        } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));

        await rental.addMasterNode(pitai);
        rentalProxy_v2 = await DeviseRentalImplV2.at(proxy.address);
        assert.equal(proxy.address, rental.address);
        assert.equal(proxy.address, rentalProxy_v2.address);
        rental_v2 = await DeviseRentalImplV2.new(token.address, dateTime.address);
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

    it("Client beneficiaries can get their money accounts", async () => {
        assert.equal(await rental.getClientForBeneficiary.call({from: clients[1]}), clients[1]);
        await rental.designateBeneficiary(clients[2], {from: clients[1]});
        assert.equal((await rental.getClientForBeneficiary.call({from: clients[2]})), clients[1]);
        assert.equal(await rental.getClientForBeneficiary.call({from: clients[1]}), clients[1]);
        await rental.designateBeneficiary(clients[1], {from: clients[1]});
        assert.equal(await rental.getClientForBeneficiary.call({from: clients[1]}), clients[1]);
        assert.equal(await rental.getClientForBeneficiary.call({from: clients[2]}), clients[2]);
    });

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
        await timeTravel(86400 * 31);
        const priceCur2 = await rental.getRentPerSeatCurrentTerm();
        const priceNext2 = await rental.getIndicativeRentPerSeatNextTerm();
        assert.isAbove(priceCur2.toNumber(), 0);
        assert.equal(priceNext2.toNumber(), priceCur2.toNumber());

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
        let ran_bid = getRandomInt(90) * min_price_per_bit * microDVZ;
        bid.push(ran_bid);
        bids.push(bid);
    }
    // balMap.set(1, Math.floor(seats[0] * Math.floor(totalUsefulness / IUDecimal)));
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
    });

    // test case 13: Devise Rental: time travel
    it("Devise Rental: time travel", async function () {
        await timeTravel(86400 * 30);
        // approve so to recognize revenue
        // 1 billion tokens
        const rev_amount = 1000 * millionDVZ * microDVZ;
        await token.approve(accountingProxy.address, rev_amount, {from: escrowWallet});
        await rental.getAllowance.call({from: clients[0]});
        let gas = 0;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call getAllowance is ", cost);
        // console.log(txid["logs"][2]["args"]["num"].toNumber());
        const prc_curr = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        const prc = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        console.log("The price for all leptons in month 2: ", prc);
        const bal = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        const dvz_amount = 10 * millionDVZ * microDVZ;
        const bids_prc = Math.floor(bids[0][0] * totalUsefulness / IUDecimal);
        if (bids_prc >= prc_curr) {
            let exp = dvz_amount - client_rental_m1[0] - 5000 * microDVZ - seats[0] * prc;
            console.log("The balance on smart contract ", bal);
            console.log("The balance based-on test case", exp);
            assert.isAtMost(Math.abs(bal - exp), 1);
        }
        else {
            let exp = dvz_amount - client_rental_m1[0] - 5000 * microDVZ;
            console.log("The balance on smart contract ", bal);
            console.log("The balance based-on test case", exp);
            assert.isAtMost(Math.abs(bal - exp), 1);
        }
        client1_bal = bal;
    });

    // test case 14: new lease by previously low bidder
    it("Devise Rental: lease leptons by client" + (4 + 1), async function () {
        // change the bid price for client 5
        bid5 = [99 * min_price_per_bit * microDVZ];
        bids[4] = bid5;
        let bids_per_round = bids[4].slice(0);
        console.log("Client " + 4, " bid ", bids_per_round);
        let seats_per_round = seats.slice(0);
        const initialBal = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        const approval_amt = 1000 * millionDVZ * microDVZ;
        await token.approve(accountingProxy.address, approval_amt, {from: escrowWallet});
        const txid = await rental.leaseAll(bids_per_round[0], seats_per_round[0], {from: clients[4]});
        const postLeaseBal = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        assert.isAbove(initialBal, postLeaseBal);
        client_rental_m1[4] += initialBal - postLeaseBal;
        console.log("Lease round " + 1);
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        costs[4] = gas * gasPrice * ethPrice / 10 ** 9;
        if (txid["logs"][5] !== undefined)
            console.log(txid["logs"][5]["args"]["title"], txid["logs"][5]["args"]["addr"]);
        const newBal = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        console.log("The new balance after second lease for client 5 ", newBal);
        console.log("Current term price is ", (await rental.getRentPerSeatCurrentTerm()).toNumber());
        console.log("Next term price is ", (await rental.getIndicativeRentPerSeatNextTerm()).toNumber());
        console.log(costs[4]);
    });

    // test case 15: calculate lease prices in stage 2
    it("Devise Rental: time travel stage 2", async function () {
        const balPreTimeTravel = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        let priceOfOwnBid = Math.floor(bids[4][0] * (totalUsefulness / 1000000) * seats[0]);
        const month_plus_one_prc = (await rental.getIndicativeRentPerSeatNextTerm()).toNumber();
        console.log("Month 1 price = " + month_plus_one_prc);
        await timeTravel(86400 * 35);
        const month_plus_two_prc = (await rental.getRentPerSeatCurrentTerm()).toNumber();
        console.log("Month 2 price = " + month_plus_two_prc);

        await token.approve(accountingProxy.address, 1000 * millionDVZ * microDVZ, {from: escrowWallet});
        const txid = await rental.updateGlobalState({from: pitai});
        let gas = txid.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call updateGlobalState is ", cost);
        console.log("Current term price is ", (await rental.getRentPerSeatCurrentTerm()).toNumber());
        const price_next_term = await rental.getIndicativeRentPerSeatNextTerm.call();
        console.log("The price for the next term is ", price_next_term.toNumber());

        // this client provisioned 10,000,000 DVZ
        const dvz_amount = 10 * millionDVZ * microDVZ;
        const prc_curr = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        const prc_per_bit_curr = prc_curr / Math.floor(totalUsefulness / 1000000);
        console.log("The price for all leptons in month 3: ", prc_curr);
        const bal = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        // if this client was removed for not being able to afford own bid, make sure he wasn't charged
        if (balPreTimeTravel < priceOfOwnBid) {
            assert.equal(bal, balPreTimeTravel);
        } else if (bids[4][0] >= prc_per_bit_curr) {
            // check if this client paid for first + second, or first + second + third months
            let charge = seats[0] * prc_curr;
            let exp1 = dvz_amount - client_rental_m1[4] - (seats[0] * month_plus_one_prc);
            let exp2 = dvz_amount - client_rental_m1[4] - (seats[0] * month_plus_one_prc) - (seats[0] * month_plus_two_prc);
            let res = (bal < charge && (exp1 < 0 || exp2 < 0)) ||
                Math.abs(bal - exp1) <= 1 || Math.abs(bal - exp2) <= 1;
            console.log("The balance on smart contract ", bal);
            console.log("The balance based-on test case, scenario 1", exp1);
            console.log("The balance based-on test case, scenario 2", exp2);
            // assert.isAtMost(Math.abs(bal - exp), 1);
            assert.isTrue(res);
        }
        else {
            let exp = dvz_amount - client_rental_m1[4] - 5000 * microDVZ;
            assert.isAtMost(Math.abs(bal - exp), 1);
        }
    });

    // test case 17: calculate lease prices in stage 3
    it.skip("Devise Rental: time travel stage 3", async function () {
        await timeTravel(86400 * 180);
        await token.approve(accountingProxy.address, 10000 * millionDVZ * microDVZ, {from: escrowWallet});
        const txid = await rental.updateGlobalState({from: pitai});
        let gas = txid.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call updateGlobalState is ", cost);
        console.log("Current term price is ", (await rental.getRentPerSeatCurrentTerm.call()).toNumber());
        const price = await rental.getIndicativeRentPerSeatNextTerm.call();
        console.log("The price for the next term is ", price.toNumber());
    });

    // test case 18: check allowance in stage 3
    it.skip("Devise Rental: after stage 3 time travel", async function () {
        await proxy.getAllowance.call({from: clients[4]});
        console.log("Gas used: ", 0);
        const gas = 0;
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call getAllowance is ", cost);
        // let len = txid["logs"].length;
        // console.log(txid["logs"]);
        // console.log("The price for all leptons ", txid["logs"][len - 4]["args"]["num"].toNumber());
        // console.log("The number of seats ", txid["logs"][len - 3]["args"]["num"].toNumber());
        // console.log("The amount that has been charged ", txid["logs"][len - 2]["args"]["amount"].toNumber());
        const prc = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        console.log("The price for all leptons in month 9: ", prc);
        const bal = (await rental.getAllowance.call({from: clients[4]})).toNumber();
        const prc_per_bit_next = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() / Math.floor(totalUsefulness / 1000000);
        const dvz_amount = 10 * millionDVZ * microDVZ;
        if (bids[4][0] >= prc_per_bit_next) {
            let charge = seats[0] * Math.floor(prc_per_bit_next * Math.floor(totalUsefulness / 1000000));
            let exp1 = dvz_amount - client_rental_m1[4] - 7 * charge;
            let exp2 = dvz_amount - client_rental_m1[4] - 8 * charge;
            let res = Math.abs(bal - exp1) <= 1 || Math.abs(bal - exp2) <= 1;
            console.log("The charge for the current period is ", charge);
            console.log("The balance on smart contract ", bal);
            console.log("The balance based-on test case, scenario 1", exp1);
            console.log("The balance based-on test case, scenario 2", exp2);
            // assert.isAtMost(Math.abs(bal - exp), 1);
            assert.isTrue(res);
        }
        else {
            let exp = dvz_amount - client_rental_m1[4] - 5000 * microDVZ;
            assert.isAtMost(Math.abs(bal - exp), 1);
        }
    });

    it("Client 1 was charged rent", async () => {
        const bal = (await rentalProxy_v2.getAllowance({from: clients[0]})).toNumber();
        const client1IsRenter = (await isRenter(clients[0]));
        const blockNumber = web3.eth.blockNumber;
        const currentTimeStamp = web3.eth.getBlock(blockNumber).timestamp;
        console.log("Current block timestamp: ", currentTimeStamp);
        if (client1IsRenter) {
            assert.isBelow(bal, client1_bal);
        } else {
            assert.equal(bal, client1_bal);
        }
    });

    // test case 19:
    describe('upgrade to version 2', function () {
        // No adding new functions without Proxy assembly
        it('test new function in version 2', async function () {
            const prev_bal = (await rentalProxy_v2.getAllowance({from: clients[0]})).toNumber();
            await assertRevert(rentalProxy_v2.getAllowance_v2({from: clients[0]}));
            await proxy.upgradeTo(rental_v2.address, {from: pitai});
            const bal = (await rentalProxy_v2.getAllowance_v2.call({from: clients[0]})).toNumber();
            assert.equal(prev_bal, bal);
        });
    });
});
