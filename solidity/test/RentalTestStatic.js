/*eslint-env es6*/
/* global assert, artifacts, it, contract, web3*/

const crypto = require('crypto');
const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DeviseRentalImpl = artifacts.require("./test/DeviseRentalImplTest");
const DeviseRentalImplV2 = artifacts.require("./DeviseRentalImplV3");
const DeviseToken = artifacts.require("./DeviseToken");
const moment = require('moment');
const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
const DateTime = artifacts.require("./DateTime");
const assertRevert = require('./helpers/assertRevert');
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");

// parameters to be set by tests
// default: num_clients = 6
// default: num_st_blockchain = 1
let num_clients = 2;
let num_st_blockchain = 4;

let token;
let dateutils;
let tokensale;
let rental_v2;
let rentalProxy;
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
const initialRate = new web3.BigNumber(16000);
const finalRate = new web3.BigNumber(8000);

async function setupFixtures() {
    // test case 1: DeviseToken contract deployed
    const cap = 10 * 10 ** 9 * 10 ** 6;
    token = await DeviseToken.new(cap, {from: pitai});

    const blockNumber = web3.eth.blockNumber;
    const openingTime = web3.eth.getBlock(blockNumber).timestamp;
    const closingTime = openingTime + 360 * 24 * 60 * 60;
    tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
    assert.notEqual(token.address, 0x0, "DeviseToken contract address should not be NULL.");
    assert.notEqual(token.address, 0x0, "DeviseToken contract address should not be NULL.");
    assert.notEqual(tokensale.address, 0x0, "DeviseTokenSale contract address should not be NULL.");
    // mint 1 billion tokens for token sale
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    await token.mint(tokenWallet, saleAmount);
    await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
    dateutils = await DateTime.new({from: pitai});
    const dstore = await DeviseEternalStorage.new({from: pitai});
    proxy = await DeviseRentalProxy.new(token.address, dateutils.address, dstore.address, 0, {from: pitai});

    await dstore.authorize(proxy.address, {from: pitai});

    const rentalImpl = await DeviseRentalImpl.new({from: pitai});

    await proxy.upgradeTo(rentalImpl.address, {from: pitai});
    await tokensale.setRentalProxy(proxy.address);

    rentalProxy = await DeviseRentalImpl.at(proxy.address);
    await rentalProxy.setEscrowWallet(escrowWallet);
    await rentalProxy.setRevenueWallet(revenueWallet);
    await rentalProxy.addMasterNode(pitai);
    rentalProxy_v2 = await DeviseRentalImplV2.at(proxy.address);
    assert.equal(proxy.address, rentalProxy.address);
    assert.equal(proxy.address, rentalProxy_v2.address);
    rental_v2 = await DeviseRentalImplV2.new(token.address, dateutils.address);
}

function tokensaleTestAsArray(testTitle, i) {
    it(testTitle + (i + 1), function () {
        const ether_amount = 1000;
        return tokensale.sendTransaction({
            from: clients[i],
            value: web3.toWei(ether_amount, "ether"),
            gas: 1000000
        }).then(async function (tx) {
            const currentRate = await tokensale.getCurrentRate.call();
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
        const tx = await token.approve(rentalProxy.address, dvz_amount, {from: clients[i]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call approve is ", cost);
        const allowance = await token.allowance(clients[i], rentalProxy.address);
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
        await rentalProxy.getBeneficiary.call({from: clients[i]}).then(function (ben) {
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
        return rentalProxy.getBeneficiary.call({from: clients[i]}).then(function (ben) {
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
        const numLeptons = (await rentalProxy.getNumberOfLeptons()).toNumber();
        const tx = await rentalProxy.addLepton(str1, prevLepton, usefulness1, {from: pitai});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call addLepton is ", cost);
        const price = await rentalProxy.getIndicativeRentPerSeatNextTerm.call();
        total_price += min_price_per_bit * usefulness1;
        console.log("The usefulness is ", usefulness1);
        console.log("The next term price for the first month ", price.toNumber());
        assert.equal(price.toNumber(), total_price);
        const price2 = await rentalProxy.getIndicativeRentPerSeatNextTerm.call();
        assert.equal(price2.toNumber(), total_price);
        await rentalProxy.mockCurrentTotalUsefulness({from: pitai});
    });
}

let historicalDataPrice = 0;

function requestHistoricalDataAsArray(testTitle, i) {
    it(testTitle + (i + 1), async function () {
        const before = (await rentalProxy.getAllowance.call({from: clients[i]})).toNumber();
        const txid = await rentalProxy.requestHistoricalData({from: clients[i]});
        let gas = txid.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call requestHistoricalData is ", cost);
        if (i === 0) {
            const after = (await rentalProxy.getAllowance.call({from: clients[i]})).toNumber();
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
        await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});
        const txid = await rentalProxy.leaseAll(bids_per_round[0], seats_per_round[0], {from: clients[i]});
        console.log("Lease round " + (j + 1));
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        costs[i] += gas * gasPrice * ethPrice / 10 ** 9;
        seatsAvailable -= seats_per_round[0];
        if (txid["logs"][5] !== undefined)
            console.log(txid["logs"][5]["args"]["title"], txid["logs"][5]["args"]["addr"]);
        const bal = await rentalProxy.getAllowance.call({from: clients[i]});
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

function updateLeaseTerms(testTitle) {
    it(testTitle, async function () {
        const txid = await rentalProxy.updateLeaseTerms({from: pitai});
        let gas = txid["receipt"]["gasUsed"];
        console.log("Gas used: ", gas);
        console.log("Current term price is ", (await rentalProxy.getRentPerSeatCurrentTerm.call()).toNumber());
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call updateLeaseTerms is ", cost);
    });
}

// noinspection JSUnusedLocalSymbols
function getPricesNextTermAsArray(testTitle, i) {
    it(testTitle, function () {
        return rentalProxy.getIndicativeRentPerSeatNextTerm.call().then(function (price) {
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
        const initialBalance = (await rentalProxy.getAllowance({from: clients[0]})).toNumber();
        const tx = await rentalProxy.applyForPowerUser({from: clients[0]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call applyForPowerUser is ", cost);
        const newBalance = (await rentalProxy.getAllowance({from: clients[0]})).toNumber();
        assert.equal(initialBalance - newBalance, clubFee);
        assert.equal(await rentalProxy.isPowerUser({from: clients[0]}), true);
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
        const priceCur = await rentalProxy.getRentPerSeatCurrentTerm();
        const priceNext = await rentalProxy.getIndicativeRentPerSeatNextTerm();
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
    updateLeaseTerms("Devise Rental: calculate lepton prices for next term");

    // test case 11: Devise Rental: get lepton price for next term
    getPricesNextTermAsArray("Devise Rental: get lepton " + 1 + " price for next term", 0);

    // test case 12: Devise Rental: withdraw by client1
    it("Devise Rental: withdraw by client1", async function () {
        await token.approve(rentalProxy.address, 100000 * microDVZ, {from: escrowWallet});
        const tx = await rentalProxy.withdraw(5000 * microDVZ, {from: clients[0]});
        let gas = tx.receipt.gasUsed;
        console.log("Gas used: ", gas);
        let cost = gas * gasPrice * ethPrice / 10 ** 9;
        console.log("The gas cost to call withdraw is ", cost);
        const bal = (await rentalProxy.getAllowance.call({from: clients[0]})).toNumber();
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
        await rentalProxy.setUsefulnessBaseline(dec);
        const ret = (await rentalProxy.getUsefulnessBaseline.call()).toNumber();
        assert.equal(ret, 10 ** dec);
    });

    it("Can set minimum price per bit", async function () {
        await rentalProxy.setMinimumPricePerBit(76);
        const ret = (await rentalProxy.getMinimumPricePerBit.call()).toNumber();
        assert.equal(ret, 76);
    });

    it("Can set total seats", async function () {
        await rentalProxy.setTotalSeats(200);
        const ret = (await rentalProxy.getTotalSeats.call()).toNumber();
        assert.equal(ret, 200);
    });

    it("Can set max seat percentage", async function () {
        await rentalProxy.setMaxSeatPercentage(15);
        const ret = await rentalProxy.getMaxSeatPercentage.call();
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
        await assertRevert(rentalProxy.setEscrowWallet(pitai, {from: pitai}));
    });

    it("The escrow wallet and revenue wallet should not be the same", async function () {
        await assertRevert(rentalProxy.setRevenueWallet(escrowWallet, {from: pitai}));
    });

    it("Can't set the escrow wallet and the revenue wallet from non owner account", async function () {
        await assertRevert(rentalProxy.setEscrowWallet(clients[0], {from: clients[0]}));
        await assertRevert(rentalProxy.setRevenueWallet(clients[0], {from: clients[0]}));
    });

    it('can set master node', async function () {
        await proxy.upgradeTo(rental_v2.address, {from: pitai});
        await rentalProxy_v2.setMasterNode(clients[0], {from: pitai});
    });

    it('master node can add lepton', async function () {
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

    it('The master node can add lepton after upgrade', async function () {
        let str1 = leptons[0];
        let usefulness1 = usefulnessSet[0];
        await rentalProxy_v2.addLepton(str1, '', usefulness1, {from: clients[0]});
    });
});

contract("DevseRentalStatic3", () => {
    before(setupFixtures);

    describe("Test the burnable feature", () => {
        it("Can burnable tokens", async () => {
            await tokensale.sendTransaction({
                from: pitai,
                value: web3.toWei(5, "ether"),
                gas: 1000000
            });
            const bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.isAbove(bal, 0);
            await token.burn(10000, {from: pitai});
            const new_bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.equal(new_bal + 10000, bal);
        });

        it("Cannot burn more tokens than you have", async () => {
            await tokensale.sendTransaction({
                from: escrowWallet,
                value: web3.toWei(5, "microether"),
                gas: 1000000
            });
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
            await tokensale.sendTransaction({
                from: clients[0],
                value: web3.toWei(1000, "ether"),
                gas: 1000000
            });
            const dvz_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: clients[0]});
            await rentalProxy.provision(4 * millionDVZ * microDVZ, {from: clients[0]});
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});
        });

        it("Should pass if price is above 1000 DVZ", async () => {
            await rentalProxy.leaseAll(5000 * microDVZ, 9, {from: clients[0]});
        });

        it("Should fail if price is below 1000 DVZ", async () => {
            await assertRevert(rentalProxy.leaseAll(500 * microDVZ, 9, {from: clients[0]}));
        });
    });

});
