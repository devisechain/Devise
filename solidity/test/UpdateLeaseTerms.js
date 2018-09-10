const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImplTest");
const DeviseToken = artifacts.require("./DeviseToken");
const DateTime = artifacts.require("./DateTime");
const moment = require('moment');
const {timeTravel, evmSnapshot, evmRevert, timestampToDate, assertContractState} = require('./test-utils');
const leptons = require('./leptons');
const assertRevert = require('./helpers/assertRevert');

const pitai = web3.eth.accounts[0];
const escrowWallet = web3.eth.accounts[1];
const revenueWallet = web3.eth.accounts[2];
const clients = web3.eth.accounts.slice(3);
let token;
let tokensale;
let rental;
let proxy;
let initialStateSnapshotId = 0;
let testSnapshotId = 0;
let estor;
let microDVZ = 10 ** 6;
let millionDVZ = 10 ** 6;

async function setupFixtures() {
    initialStateSnapshotId = (await evmSnapshot()).result;
    // Setup all the contracts
    const cap = 10 * 10 ** 9 * 10 ** 6;
    token = await DeviseToken.new(cap, {from: pitai});
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const blockNumber = web3.eth.blockNumber;
    const openingTime = web3.eth.getBlock(blockNumber).timestamp;
    const closingTime = openingTime + 360 * 24 * 60 * 60;
    tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
    const tokenWallet = await tokensale.tokenWallet.call();
    // mint 1 billion tokens for token sale
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    await token.mint(tokenWallet, saleAmount);
    await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
    dateTime = await DateTime.deployed();
    estor = await DeviseEternalStorage.new();
    // Create new upgradeable contract frontend (proxy)
    proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, 0, {from: pitai});
    // Set it's implementation version
    await proxy.upgradeTo((await DeviseRental_v1.new()).address);
    await tokensale.setRentalProxy(proxy.address);
    // Use implementation functions with proxy address
    rental = DeviseRental_v1.at(proxy.address);
    rental._token = token;
    rental.assertContractState = assertContractState;
    await rental.setEscrowWallet(escrowWallet);
    await rental.setRevenueWallet(revenueWallet);
    await rental.addMasterNode(pitai);
    const escrow_cap = 1000000000000000000 * microDVZ;
    await token.approve(rental.address, escrow_cap, {from: escrowWallet});

    // test addLepton can't be called prior to authorize
    await assertRevert(rental.addLepton(leptons[0], '', 1000000 * (3)));
    await estor.authorize(proxy.address);
    // Pit.AI adds leptons to rental contract
    await rental.addLepton(leptons[0], '', 1000000 * (3));
    await rental.addLepton(leptons[1], leptons[0], 1000000 * (3));
    await rental.addLepton(leptons[2], leptons[1], 1000000 * (2));
    await rental.addLepton(leptons[3], leptons[2], 1000000 * (2));
    await rental.addLepton(leptons[4], leptons[3], 1000000 * (1));
    await rental.addLepton(leptons[5], leptons[4], 1000000 * (1));
    // Some clients buy tokens and approve transfer to rental contract
    const ether_amount = 5000;
    await Promise.all(clients.slice(0, 11).map(async client => await tokensale.sendTransaction({
        from: client,
        value: web3.toWei(ether_amount, "ether"),
        gas: 1000000
    })));
    await Promise.all(clients.slice(0, 11).map(async client => await token.approve(rental.address, 100 * millionDVZ * microDVZ, {from: client})));
    // move forward 1 month
    await timeTravel(86400 * 31);
    // snapshot the blockchain
    testSnapshotId = (await evmSnapshot()).result;
}

async function getProratedDues(seats, extraMonths) {
    // mimic the price calculation used in solidity
    const price = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() * seats;
    let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
    let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
    const prorated = Math.floor((price / daysInMonth) * (daysInMonth - (moment(d).utc().date() - 1)));
    return extraMonths ? (price * extraMonths * seats) + prorated : prorated;
}

contract("UpdateLeaseTerms", function () {
    // before running all tests, setup fixtures
    before(setupFixtures);
    // reset to our fixtures state after each test
    afterEach(async () => {
        evmRevert(testSnapshotId);
        // workaround ganache/testrpc crash
        testSnapshotId = (await evmSnapshot()).result;
    });
    after(async () => {
        evmRevert(initialStateSnapshotId);
    });


    it("getClientSummary returns correct information", async () => {
        const client = clients[0];
        const client_provision = millionDVZ * microDVZ;
        await rental.provision(client_provision, {from: client});

        const clientInfo1 = await rental.getClientSummary(client);
        assert.equal(clientInfo1[0], client); // beneficiary
        assert.equal(clientInfo1[1].toNumber(), client_provision);  // escrow balance
        const tokenBalance = (await token.balanceOf(client)).toNumber();
        assert.equal(clientInfo1[2].toNumber(), tokenBalance);  // token balance
        assert.equal(clientInfo1[3].toNumber(), 0); // leaseTermPaid should be 0, none paid ever
        assert.equal(clientInfo1[4], true); // power user
        assert.equal(clientInfo1[5], true); // historical data access
        assert.equal(clientInfo1[6].toNumber(), 0); // currentTermSeats
        assert.equal(clientInfo1[7].toNumber(), 0); // indicativeNextTermSeats
        const rent = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        await rental.assertContractState({
            expectedEscrow: client_provision,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: rent,
            expectedNextTermRent: rent
        });

        // test leaseAll can't be called if unauthorized
        await estor.unauthorize(proxy.address);
        await assertRevert(rental.leaseAll(10000 * microDVZ, 10, {from: client}));
        await estor.authorize(proxy.address);

        // lease 10 seats
        await rental.leaseAll(10000 * microDVZ, 10, {from: client});
        await rental.leaseAll(10000 * microDVZ, 10, {from: client});
        await rental.leaseAll(10000 * microDVZ, 10, {from: client});
        const dues = await getProratedDues(10);
        const clientInfo2 = await rental.getClientSummary(client);
        assert.equal(clientInfo2[0], client);
        assert.equal(clientInfo2[1].toNumber(), client_provision - dues); // escrow balance
        assert.equal(clientInfo2[2].toNumber(), tokenBalance);
        assert.equal(clientInfo2[4], true); // client meets power user minimum
        assert.equal(clientInfo2[5], true); // client has historical data access
        assert.equal(clientInfo2[6].toNumber(), 10); // currentTermSeats
        assert.equal(clientInfo2[7].toNumber(), 10); // indicativeNextTermSeats
        await rental.assertContractState({
            expectedEscrow: client_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [10000 * microDVZ]],
            expectedRent: rent,
            expectedNextTermRent: rent
        });

        // withdraw unused escrow balance
        await rental.withdraw(clientInfo2[1].toNumber() - 1234, {from: client});
        const clientInfo3 = await rental.getClientSummary(client);
        assert.equal(clientInfo3[0], client);
        assert.equal(clientInfo3[1].toNumber(), 1234); // escrow balance
        assert.equal(clientInfo3[2].toNumber(), tokenBalance + client_provision - dues - 1234);
        assert.equal(clientInfo3[4], false); // client fell behind power user minimum
        assert.equal(clientInfo3[5], false); // historical data access
        assert.equal(clientInfo3[6].toNumber(), 10); // currentTermSeats
        assert.equal(clientInfo3[7].toNumber(), 0); // indicativeNextTermSeats
        await rental.assertContractState({
            expectedEscrow: 1234,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [10000 * microDVZ]],
            expectedRent: rent,
            expectedNextTermRent: rent
        });
    });

    it("Provision updates allowance", async () => {
        const rent = (await rental.getRentPerSeatCurrentTerm()).toNumber();
        const client = clients[0];
        assert.equal(await rental.getAllowance.call({from: client}), 0);
        // client provisions balance in rental contract
        await rental.provision(1000000, {from: client});
        // balance should now be up to date
        assert.equal(await rental.getAllowance.call({from: client}), 1000000);
        await rental.assertContractState({
            expectedEscrow: 1000000,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: rent,
            expectedNextTermRent: rent
        });

        // client provisions balance in rental contract
        await rental.provision(1000000, {from: client});
        // balance should now be up to date
        assert.equal(await rental.getAllowance.call({from: client}), 2000000);
        await rental.assertContractState({
            expectedEscrow: 2000000,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: rent,
            expectedNextTermRent: rent
        });
    });

    it("Provision should update lease terms before increasing allowance", async () => {
        const client = clients[0];
        assert.equal(await rental.getAllowance.call({from: client}), 0);
        // client provisions balance in rental contract and leases
        const iu = (await rental.getTotalIncrementalUsefulness()).toNumber();
        const rent = (await rental.getRentPerSeatCurrentTerm()).toNumber();
        const dues = await getProratedDues(10);
        const client_provision = 1000000 * microDVZ;
        await rental.provision(client_provision, {from: client});
        await rental.assertContractState({
            expectedEscrow: client_provision,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: rent,
            expectedNextTermRent: rent
        });

        const client_bid = 2000 * microDVZ;
        await rental.leaseAll(client_bid, 10, {from: client});
        const allowance = (await rental.getAllowance.call({from: client})).toNumber();
        const newRent = rent * 2;
        await rental.assertContractState({
            expectedEscrow: client_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [client_bid]],
            expectedRent: rent,
            expectedNextTermRent: newRent
        });

        assert.equal(allowance, client_provision - dues);
        // cancel lease for future months
        await rental.leaseAll(client_bid, 0, {from: client});
        // time passes, move forward 6 months
        await timeTravel(86400 * 6 * 30);
        const more_provision = 2000 * microDVZ;
        await rental.provision(more_provision, {from: client});

        // we should only have gotten charged for the 1 term
        const currentBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(currentBalance, client_provision + more_provision - dues);
        await rental.assertContractState({
            expectedEscrow: client_provision + more_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: rent,
            expectedNextTermRent: rent
        });
    });

    it("getAllowance updates all previous lease terms when contract state stale for 6 months", async () => {
        const client = clients[0];
        const initialAllowance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(initialAllowance, 0);

        // client provisions balance in rental contract and calls leaseAll
        const client_provision = 30 * millionDVZ * microDVZ;
        const bal = (await token.balanceOf.call(client)).toNumber();
        assert.isAbove(bal, client_provision);
        await rental.provision(client_provision, {from: client});
        const postProvisionBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(postProvisionBalance, client_provision);
        await rental.assertContractState({
            expectedEscrow: client_provision,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });

        // Lease 10 seats (should charge us first month's lease right away)
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        let dues = await getProratedDues(10);
        const client_bid = 10000 * microDVZ;
        await rental.leaseAll(client_bid, 10, {from: client});
        const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.isBelow(postLeaseBalance, postProvisionBalance);
        await rental.assertContractState({
            expectedEscrow: client_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [client_bid]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });

        // we start with prorated dues for the month in which we leased
        for (let i = 0; i < 6; i++) {
            const balance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 10);
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
        // check that we would collect the right amounts after 7 months
        const price = (await rental.getRentPerSeatCurrentTerm.call()).toNumber() * 10;
        await rental.updateLeaseTerms();
        await rental.assertContractState({
            expectedEscrow: client_provision - (dues + Math.floor(price)),
            expectedRevenue: dues + Math.floor(price),
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [client_bid]],
            expectedRent: 12 * client_bid,
            expectedNextTermRent: 12 * client_bid
        });
    });

    it("leaseAll doesn't decrease allowance when seats not available", async () => {
        // Make sure we have enough clients in ganache to test this
        assert.isAbove(clients.length, 10);
        const provision_amount = 10 * millionDVZ * microDVZ;
        const client_bid = 10000 * microDVZ;
        // First 10 clients get 10 seats each maxing out the lease term
        let dues = await getProratedDues(10);
        await Promise.all(clients.slice(0, 10).map(async client => {
            await rental.provision(provision_amount, {from: client});
            const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(preLeaseBalance, provision_amount);
            await rental.leaseAll(client_bid, 10, {from: client});
            const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(postLeaseBalance, preLeaseBalance - dues);
        }));
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 10) - (dues * 10),
            expectedRevenue: dues * 10,
            expectedClients: clients.slice(0, 10),
            expectedRenters: clients.slice(0, 10),
            expectedBids: [clients.slice(0, 10), clients.slice(0, 10).map(c => 10), clients.slice(0, 10).map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });

        // this is the client that won't be charged since she can't get seats
        const client = clients[10];
        await rental.provision(provision_amount, {from: client});
        const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
        await rental.leaseAll(client_bid, 10, {from: client});
        const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(preLeaseBalance, postLeaseBalance);
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 11) - (dues * 10),
            expectedRevenue: dues * 10,
            expectedClients: clients.slice(0, 11),
            expectedRenters: clients.slice(0, 10),
            expectedBids: [clients.slice(0, 11), clients.slice(0, 11).map(c => 10), clients.slice(0, 11).map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });
    });

    it("leaseAll checks if client has enough tokens to pay for lease", async () => {
        const provision_amount = 10 * millionDVZ * microDVZ;
        const client_bid = 10000 * microDVZ;
        // First 5 clients get 10 seats each
        let dues = await getProratedDues(10);
        await Promise.all(clients.slice(0, 5).map(async client => {
            await rental.provision(provision_amount, {from: client});
            const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(preLeaseBalance, provision_amount);
            await rental.leaseAll(client_bid, 10, {from: client});
            const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
            assert.equal(postLeaseBalance, preLeaseBalance - dues);
        }));
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 5) - (dues * 5),
            expectedRevenue: dues * 5,
            expectedClients: clients.slice(0, 5),
            expectedRenters: clients.slice(0, 5),
            expectedBids: [clients.slice(0, 5), clients.slice(0, 5).map(c => 10), clients.slice(0, 5).map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });

        // Next client doesn't provision enough so shouldn't get in
        const client = clients[5];
        const insuffient_amount = 10 * microDVZ;
        await rental.provision(insuffient_amount, {from: client});
        const preLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(preLeaseBalance, insuffient_amount);
        try {
            await rental.leaseAll(client_bid, 10, {from: client});
            assert.fail("Lease All didn't thrown when it should have");
        } catch (e) {
        }
        const postLeaseBalance = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(postLeaseBalance, preLeaseBalance);
        await rental.assertContractState({
            expectedEscrow: insuffient_amount + (provision_amount * 5) - (dues * 5),
            expectedRevenue: dues * 5,
            expectedClients: clients.slice(0, 6),
            expectedRenters: clients.slice(0, 5),
            expectedBids: [clients.slice(0, 5), clients.slice(0, 5).map(c => 10), clients.slice(0, 5).map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });
    });

    it("Price goes up on second term with 1 bidder", async () => {
        const client = clients[0];
        const client_bid = 12345 * microDVZ;
        const client_provision = 10 * millionDVZ * microDVZ;
        let dues = await getProratedDues(10);
        await rental.provision(client_provision, {from: client});
        await rental.leaseAll(client_bid, 10, {from: client});
        await rental.assertContractState({
            expectedEscrow: client_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [client_bid]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });
    });

    it("Price uses the right totalIncrementalUsefulness for price calculations", async () => {
        // lease by first client
        const client1 = clients[0];
        const client_bid = 1234 * microDVZ;
        const ethBal = (await web3.eth.getBalance(client1)).toNumber();
        const client_provision = 50 * millionDVZ * microDVZ;
        let dues = await getProratedDues(10);
        await rental.provision(client_provision, {from: client1});
        await rental.leaseAll(client_bid, 10, {from: client1});
        const client1Balance = (await rental.getAllowance.call({from: client1})).toNumber();

        // current month and next month are both based on current IU
        const priceMonth1 = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        const usefulness = Math.floor((await rental.getTotalIncrementalUsefulness()).toNumber() / 1000000);
        assert.equal((await rental.getIndicativeRentPerSeatNextTerm.call()).toNumber(), usefulness * client_bid);

        // add a lepton to increse totalIncrementalUsefulness, current term price stays the same, next term increases in price
        await rental.addLepton(leptons[6], leptons[5], 1000000 * (1));
        assert.equal(Math.floor((await rental.getTotalIncrementalUsefulness()).toNumber() / 1000000), usefulness + 1);
        await rental.assertContractState({
            expectedEscrow: client_provision - dues,
            expectedRevenue: dues,
            expectedClients: [client1],
            expectedRenters: [client1],
            expectedBids: [[client1], [10], [client_bid]],
            expectedRent: 1000 * usefulness * microDVZ,
            expectedNextTermRent: (usefulness + 1) * client_bid
        });

        // lease by second client, should get charged the same as first client
        const client2 = clients[1];
        await rental.provision(client_provision, {from: client2});
        await rental.leaseAll(client_bid, 10, {from: client2});
        const client2Balance = (await rental.getAllowance.call({from: client2})).toNumber();
        assert.equal(client1Balance, client2Balance);
        await rental.assertContractState({
            expectedEscrow: (client_provision * 2) - (dues * 2),
            expectedRevenue: dues * 2,
            expectedClients: [client1, client2],
            expectedRenters: [client1, client2],
            expectedBids: [[client1, client2], [10, 10], [client_bid, client_bid]],
            expectedRent: 1000 * usefulness * microDVZ,
            expectedNextTermRent: (usefulness + 1) * client_bid
        });

        const initialCurrentLeaseTerm = (await rental.getCurrentLeaseTerm()).toNumber();
        for (let i = 1; i <= 6; i++) {
            // time passes, move forward at least 1 month
            await timeTravel(86400 * 31);
            // Current price should include new usefulness
            const client1BalanceMonth2 = (await rental.getAllowance.call({from: client1})).toNumber();
            const client2BalanceMonth2 = (await rental.getAllowance.call({from: client2})).toNumber();
            assert.equal(client1BalanceMonth2, client2BalanceMonth2);
        }
        // after 6 months, collect rent and check that we collected it right
        await rental.updateLeaseTerms();
        let duesNewIu = (usefulness + 1) * client_bid * 10;
        const currentLeaseTerm = (await rental.getCurrentLeaseTerm()).toNumber();
        const totalDues = (dues * 2) + (duesNewIu * 2 * (currentLeaseTerm - initialCurrentLeaseTerm));
        await rental.assertContractState({
            expectedEscrow: (client_provision * 2) - totalDues,
            expectedRevenue: totalDues,
            expectedClients: [client1, client2],
            expectedRenters: [client1, client2],
            expectedBids: [[client1, client2], [10, 10], [client_bid, client_bid]],
            expectedRent: (usefulness + 1) * client_bid,
            expectedNextTermRent: (usefulness + 1) * client_bid
        });
    });

    it("updateLeaseTerms removes clients who run out of tokens", async () => {
        const provision_amount = 10 * millionDVZ * microDVZ;
        const client_bid = 10000 * microDVZ;
        // First 5 clients get 10 seats each
        let numSeats = 100;
        const goodClients = clients.slice(0, 5);
        let dues = await getProratedDues(10);
        await Promise.all(goodClients.map(async client => {
            await rental.provision(provision_amount, {from: client});
            await rental.leaseAll(client_bid, 10, {from: client});
            numSeats -= 10;
        }));
        const numSeatsAvailable = (await rental.getSeatsAvailable.call()).toNumber();
        assert.equal(numSeatsAvailable, numSeats);
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 5) - (dues * 5),
            expectedRevenue: dues * 5,
            expectedClients: clients.slice(0, 5),
            expectedRenters: clients.slice(0, 5),
            expectedBids: [goodClients, goodClients.map(c => 10), goodClients.map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: client_bid * 12
        });

        // this client only provisions enough for 1 term
        const client = clients[5];
        let dues2 = await getProratedDues(10);
        await rental.provision(dues2, {from: client});
        await rental.leaseAll(client_bid, 10, {from: client});
        await rental.assertContractState({
            expectedEscrow: dues2 + (provision_amount * 5) - (dues * 5) - dues2,
            expectedRevenue: dues2 + (dues * 5),
            expectedClients: clients.slice(0, 6),
            expectedRenters: clients.slice(0, 6),
            expectedBids: [clients.slice(0, 6), clients.slice(0, 6).map(c => 10), clients.slice(0, 6).map(c => client_bid)],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 12 * client_bid
        });

        assert.equal((await rental.getSeatsAvailable.call()).toNumber(), numSeats - 10);
        assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 10);
        assert.equal((await rental.getNextTermSeats.call({from: client})).toNumber(), 0);

        // Jump forward to next month
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        await timeTravel(86400 * (1 + daysInMonth - d.getDate()));
        // test each renter with enough tokens still has seats
        for (let i = 0; i < goodClients.length; i++) {
            const renter = await rental.getRenter.call(i);
            assert.include(goodClients, renter);
            assert.equal((await rental.getCurrentTermSeats.call({from: renter})).toNumber(), 10);
        }
        const finalAvailableSeats = (await rental.getSeatsAvailable.call()).toNumber();
        assert.equal(finalAvailableSeats, numSeats);
        // assert that we collected the right rent after all the terms
        await rental.updateLeaseTerms();
        const rent = (await rental.getRentPerSeatCurrentTerm.call()).toNumber();
        await rental.assertContractState({
            expectedEscrow: dues2 + (provision_amount * 5) - (dues * 5) - dues2 - (rent * 50),
            expectedRevenue: dues2 + (dues * 5) + (rent * 50),
            expectedClients: clients.slice(0, 6),
            expectedRenters: clients.slice(0, 5),
            expectedBids: [clients.slice(0, 6), clients.slice(0, 6).map(c => 10), clients.slice(0, 6).map(c => client_bid)],
            expectedRent: 12 * client_bid,
            expectedNextTermRent: 12 * client_bid
        });
    });

    it("Withdraw decreases allowance", async () => {
        const client = clients[0];
        await rental.provision(10000, {from: client});
        const allowanceBeforeWithdraw = await rental.getAllowance.call({from: client});
        assert.equal(allowanceBeforeWithdraw, 10000);
        await rental.withdraw(100, {from: client});
        const allowanceAfterWithdraw = await rental.getAllowance.call({from: client});
        assert.equal(allowanceAfterWithdraw, 9900);
        await rental.assertContractState({
            expectedEscrow: 10000 - 100,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });
    });
    it("getAllowance call() matches before and after updateLeaseTerm with contract stale for 6 months", async () => {
        const client = clients[0];
        // client provisions balance in rental contract and calls leaseAll
        const provision_amount = 10 * millionDVZ * microDVZ;
        await rental.provision(provision_amount, {from: client});
        await rental.leaseAll(10000 * microDVZ, 10, {from: client});
        // time passes (~6 months)
        await timeTravel(86400 * 30 * 6);
        // client checks his own balance in a free call()
        const allowanceBeforeUpdate = (await rental.getAllowance.call({from: client})).toNumber();
        // We make a transaction to update the contract's internal state
        await rental.updateLeaseTerms();
        // client checks his own balance in a free call()
        const allowanceAfterUpdate = (await rental.getAllowance.call({from: client})).toNumber();
        assert.equal(allowanceBeforeUpdate, allowanceAfterUpdate);
        await rental.assertContractState({
            expectedEscrow: allowanceAfterUpdate,
            expectedRevenue: provision_amount - allowanceAfterUpdate,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [10], [10000 * microDVZ]],
            expectedRent: 10000 * 12 * microDVZ,
            expectedNextTermRent: 10000 * 12 * microDVZ
        });
    });

    it("Client loses power user privileges if token drops below minimum power user balance", async () => {
        const provision_amount = millionDVZ * microDVZ;
        const client = clients[0];
        await rental.provision(provision_amount, {from: client});
        await rental.applyForPowerUser({from: client});
        assert.equal(await rental.isPowerUser.call({from: client}), true);
        const nextTermRent = (await rental.getIndicativeRentPerSeatNextTerm()).toNumber();
        const wd_amount = (provision_amount - nextTermRent) + 1;
        await rental.withdraw(wd_amount, {from: client});
        const allowanceAfterWithdraw = (await rental.getAllowance.call({from: client})).toNumber();
        assert.isBelow(allowanceAfterWithdraw, nextTermRent);
        assert.equal(await rental.isPowerUser.call({from: client}), false);
        await rental.assertContractState({
            expectedEscrow: allowanceAfterWithdraw,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        })
    });

    it("Cancelled leases do not count toward price", async () => {
        const provision_amount = 1000000 * microDVZ;
        const client_bid1 = 10000 * microDVZ;
        const client_bid2 = 6000 * microDVZ;
        const dues = await getProratedDues(1);
        await rental.provision(provision_amount, {from: clients[0]});
        await rental.provision(provision_amount, {from: clients[1]});
        await rental.provision(provision_amount, {from: clients[2]});
        await rental.leaseAll(client_bid1, 1, {from: clients[0]});
        await rental.leaseAll(client_bid1, 1, {from: clients[1]});
        await rental.leaseAll(client_bid2, 1, {from: clients[2]});
        const totalIncrementalUsefulness = Math.floor((await rental.getTotalIncrementalUsefulness()).toNumber() / 1000000);
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 3) - (dues * 3),
            expectedRevenue: dues * 3,
            expectedClients: [clients[0], clients[1], clients[2]],
            expectedRenters: [clients[0], clients[1], clients[2]],
            expectedBids: [[clients[0], clients[1], clients[2]], [1, 1, 1], [client_bid1, client_bid1, client_bid2]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: client_bid1 * totalIncrementalUsefulness
        });
        // cancel bid
        await rental.leaseAll(client_bid1, 0, {from: clients[1]});
        await rental.assertContractState({
            expectedEscrow: (provision_amount * 3) - (dues * 3),
            expectedRevenue: dues * 3,
            expectedClients: [clients[0], clients[1], clients[2]],
            expectedRenters: [clients[0], clients[1], clients[2]],
            expectedBids: [[clients[0], clients[2]], [1, 1], [client_bid1, client_bid2]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: client_bid2 * totalIncrementalUsefulness
        });
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

    it("Retains the same information after upgrade", async () => {
        const DeviseRental_v2 = artifacts.require("./DeviseRentalImplV2");
        await rental.provision(100000 * microDVZ, {from: clients[0]});
        await rental.provision(100000 * microDVZ, {from: clients[1]});
        await rental.leaseAll(10 * 10 ** 3 * microDVZ, 5, {from: clients[0]});
        await rental.leaseAll(20 * 10 ** 3 * microDVZ, 7, {from: clients[1]});
        await timeTravel(86400 * 30 * 6);
        const priceCurrentTerm = (await rental.getRentPerSeatCurrentTerm()).toNumber();
        const proxy = DeviseRentalBase.at(rental.address);
        await proxy.upgradeTo((await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
        const rental_v2 = DeviseRental_v2.at(rental.address);
        const priceCurrentTermPostUpgrade = (await rental_v2.getRentPerSeatCurrentTerm()).toNumber();
        assert.equal(priceCurrentTermPostUpgrade, priceCurrentTerm);
    });

    it("Can add new functions with upgrades", async () => {
        const provision_amount = 10000 * microDVZ;
        const DeviseRental_v2 = artifacts.require("./test/DeviseRentalImplV3");
        await rental.provision(provision_amount, {from: clients[0]});
        const bal_v1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        // upgrade to v2
        const proxy = DeviseRentalBase.at(rental.address);
        await proxy.upgradeTo((await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
        const rental_v2 = DeviseRental_v2.at(proxy.address);
        const bal_v2 = (await rental_v2.getAllowance_v2.call({from: clients[0]})).toNumber();
        assert.equal(bal_v1, bal_v2);
    });

    it("Can change the implementation of existing functions", async () => {
        // upgrade to v2
        const DeviseRental_v2 = artifacts.require("./test/DeviseRentalImplV2");
        await proxy.upgradeTo((await DeviseRental_v2.new({from: pitai})).address, {from: pitai});
        const rental_v2 = DeviseRental_v2.at(proxy.address);
        await rental_v2.provision(10000, {from: clients[0]});
        const bal_v2 = (await rental_v2.getAllowance.call({from: clients[0]})).toNumber();
        assert.equal(bal_v2, 9998);
    });

    it("Cannot override the type of state variables with upgrades", async () => {
        const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
        await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
        const rental_v3 = DeviseRental_v3.at(proxy.address);
        // can't work without Proxy fallback assembly
        await rental_v3.setVersion(3, {from: pitai});
        const testString1 = (await proxy.version.call({from: clients[0]})).toNumber();
        assert.equal(testString1, 2);
    });

    it("Cannot override state variables with new same type variable in upgrades", async () => {
        const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
        await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
        const rental_v3 = DeviseRental_v3.at(proxy.address);
        const seats = (await rental_v3.getSeatsAvailable.call({from: clients[0]})).toNumber();
        assert.equal(seats, 100);
        const seats2 = (await rental_v3.getSeatsAvailable.call({from: clients[0]})).toNumber();
        assert.equal(seats2, 100);
    });


    it("Only owner can upgrade contract", async () => {
        const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
        await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: pitai});
        try {
            await proxy.upgradeTo((await DeviseRental_v3.new({from: pitai})).address, {from: clients[0]});
            expect.fail(null, null, "Only owner should be able to upgrade contract");
        } catch (e) {
        }
    });

    it("Deducts the right power user fee", async () => {
        const provision_amount = 10 * millionDVZ * microDVZ;
        const club_fee = 10000 * microDVZ;
        await rental.setPowerUserClubFee(club_fee, {from: pitai});
        await rental.provision(provision_amount, {from: clients[0]});
        const bal1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        assert.equal(bal1, provision_amount);
        await rental.applyForPowerUser({from: clients[0]});
        const bal2 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        assert.equal(bal2, provision_amount - club_fee);
    });

    it("Uses the right historical data fee", async () => {
        const provision_amount = 10 * millionDVZ * microDVZ;
        const club_fee = 10000 * microDVZ;
        await rental.setHistoricalDataFee(club_fee, {from: pitai});
        await rental.provision(provision_amount, {from: clients[0]});
        const bal1 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        assert.equal(bal1, provision_amount);
        await rental.requestHistoricalData({from: clients[0]});
        const bal2 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        assert.equal(bal2, provision_amount - club_fee);
    });

    it("Can list all leptons in the blockchain", async () => {
        const numLeptons = (await rental.getNumberOfLeptons.call()).toNumber();
        assert.equal(numLeptons, 6);
        for (let i = 0; i < numLeptons; i++) {
            const lepton = await rental.getLepton(i);
            assert.equal(lepton[0], leptons[i]);
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

    it("Can get the current number of seats leased", async function () {
        await rental.provision(100000 * microDVZ, {from: clients[0]});
        await rental.provision(100000 * microDVZ, {from: clients[1]});
        await rental.leaseAll(10 * 10 ** 3 * microDVZ, 5, {from: clients[0]});
        await rental.leaseAll(20 * 10 ** 3 * microDVZ, 7, {from: clients[1]});

        const client1Seats = (await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber();
        assert.equal(5, client1Seats);
        const client2Seats = (await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber();
        assert.equal(7, client2Seats);
    });


    it("Can get the next term's number of seats leased", async function () {
        await rental.provision(100000 * microDVZ, {from: clients[0]});
        await rental.provision(10000000 * microDVZ, {from: clients[1]});
        await rental.leaseAll(10 * 10 ** 3 * microDVZ, 5, {from: clients[0]});
        await rental.leaseAll(20 * 10 ** 3 * microDVZ, 7, {from: clients[1]});

        const client1Seats = (await rental.getNextTermSeats.call({from: clients[0]})).toNumber();
        assert.equal(0, client1Seats);
        const client2Seats = (await rental.getNextTermSeats.call({from: clients[1]})).toNumber();
        assert.equal(7, client2Seats);
    });

    it("Can return the current lease term index", async function () {
        // compare the up to date least term getter with the public variable value
        const leaseTerm = (await rental.getCurrentLeaseTerm()).toNumber();
        await rental.updateLeaseTerms();
        const publicLeaseTerm = (await rental.leaseTerm()).toNumber();
        const idx = moment([2018, 1, 1]).diff(moment(new Date()), 'months', true);
        assert.isAbove(leaseTerm, idx);
        assert.equal(publicLeaseTerm, leaseTerm);
    });

    it("Clients can get in on a subsequent term if they raise the price enough", async () => {
        // Client 1 gets all the seats this term
        const leaseTerm1 = (await rental.getCurrentLeaseTerm.call()).toNumber();
        assert.equal((await rental.seatsAvailable.call()).toNumber(), 100);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 0);
        assert.equal((await rental.getPricePerBitCurrentTerm.call()).toNumber(), 1000 * microDVZ);
        await rental.provision(5000000 * microDVZ, {from: clients[0]});
        await rental.leaseAll(1000 * microDVZ, 100, {from: clients[0]});
        assert.equal((await rental.seatsAvailable.call()).toNumber(), 0);

        // Client 2 bids up the price to get seats next term, but gets none this term
        await rental.provision(12 * 4000 * 100 * microDVZ, {from: clients[1]});
        await rental.leaseAll(2000 * microDVZ, 100, {from: clients[1]});
        // price went up next term
        assert.equal((await rental.getIndicativePricePerBitNextTerm.call()).toNumber(), 2000 * microDVZ);
        // client 1 has seats this term and 0 seats next term
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 100);
        assert.equal((await rental.getNextTermSeats.call({from: clients[0]})).toNumber(), 0);
        // client 2 has no seats this term but gets seats next term
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber(), 0);
        assert.equal((await rental.getNextTermSeats.call({from: clients[1]})).toNumber(), 100);
        // Next month, make sure current term seats are correct
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        await timeTravel(86400 * (2 + daysInMonth - d.getDate()));
        const leaseTerm2 = (await rental.getCurrentLeaseTerm.call()).toNumber();
        assert.equal(leaseTerm2, leaseTerm1 + 1);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 0);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber(), 100);
    });

    it("Clients lose their seats when they can't afford the new rent", async () => {
        // provision 1 month of rent
        const initialRevenueBalance = (await token.balanceOf(await rental.revenueWallet.call())).toNumber();
        const rent = await getProratedDues(5);
        const price = (await rental.getPricePerBitCurrentTerm.call()).toNumber();
        await rental.provision(10 + rent, {from: clients[0]});
        await rental.provision(20 + rent, {from: clients[1]});
        // check that we have not collected any revenue
        await rental.assertContractState({
            expectedEscrow: 10 + 20 + rent * 2,
            expectedRevenue: 0,
            expectedClients: [clients[0], clients[1]],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ,
        });

        await rental.leaseAll(price, 5, {from: clients[0]});
        await rental.leaseAll(price, 5, {from: clients[1]});
        // check that we collected the right amount of tokens into the revenue wallet
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 5);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber(), 5);
        await rental.assertContractState({
            expectedEscrow: 10 + 20,
            expectedRevenue: initialRevenueBalance + (2 * rent),
            expectedClients: [clients[0], clients[1]],
            expectedRenters: [clients[0], clients[1]],
            expectedBids: [[clients[0], clients[1]], [5, 5], [price, price]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ,
        });

        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 5);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber(), 5);
        assert.equal((await rental.getNextTermSeats.call({from: clients[0]})).toNumber(), 0);
        assert.equal((await rental.getNextTermSeats.call({from: clients[1]})).toNumber(), 0);
        // move forward to when clients have no seats
        let d = timestampToDate(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        let daysInMonth = new Date(d.getYear(), d.getMonth() + 1, 0).getDate();
        await timeTravel(86400 * (1 + daysInMonth - d.getDate()));

        // check that clients have no seats and their balances are correct
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[0]})).toNumber(), 0);
        assert.equal((await rental.getCurrentTermSeats.call({from: clients[1]})).toNumber(), 0);
        const escrowBalance0 = (await rental.getAllowance.call({from: clients[0]})).toNumber();
        const escrowBalance1 = (await rental.getAllowance.call({from: clients[1]})).toNumber();
        assert.equal(escrowBalance0, 10);
        assert.equal(escrowBalance1, 20);

        // call updateLeastTerms manually and make sure we have not collected any additional revenue
        await rental.updateLeaseTerms();
        await rental.assertContractState({
            expectedEscrow: 10 + 20,
            expectedRevenue: initialRevenueBalance + (2 * rent),
            expectedClients: [clients[0], clients[1]],
            expectedRenters: [],
            expectedBids: [[clients[0], clients[1]], [5, 5], [price, price]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ,
        });
    });

    it("Clients can update their bids to get more or less seats", async () => {
        const client = clients[0];
        // provision 1 month of rent
        const oneSeatRent = await getProratedDues(1);
        const fiveSeatRent = await getProratedDues(5);
        const rent = oneSeatRent + fiveSeatRent;
        const provisionAmount = 10 + rent + (6 * 1000 * 12 * microDVZ); // provision 2 months rent for 6 seats
        const price = (await rental.getPricePerBitCurrentTerm.call()).toNumber();
        await rental.provision(provisionAmount, {from: client});
        await rental.assertContractState({
            expectedEscrow: provisionAmount,
            expectedRevenue: 0,
            expectedClients: [client],
            expectedRenters: [],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });

        // client asks for 5 seats
        await rental.leaseAll(price, 5, {from: client});
        assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 5);
        assert.equal((await rental.getNextTermSeats.call({from: client})).toNumber(), 5);
        await rental.assertContractState({
            expectedEscrow: provisionAmount - fiveSeatRent,
            expectedRevenue: fiveSeatRent,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [5], [price]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });

        // client asks for more seats
        await rental.leaseAll(price, 6, {from: client});
        // assert we got the right number of seats
        assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 6);
        assert.equal((await rental.getNextTermSeats.call({from: client})).toNumber(), 6);
        await rental.assertContractState({
            expectedEscrow: provisionAmount - (fiveSeatRent + oneSeatRent),
            expectedRevenue: fiveSeatRent + oneSeatRent,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [6], [price]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });

        // client asks for less seats
        await rental.leaseAll(price, 5, {from: client});
        // assert we got the right number of seats
        assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 6);
        assert.equal((await rental.getNextTermSeats.call({from: client})).toNumber(), 5);
        await rental.assertContractState({
            expectedEscrow: provisionAmount - (fiveSeatRent + oneSeatRent),
            expectedRevenue: fiveSeatRent + oneSeatRent,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[client], [5], [price]],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });

        // client cancels bid
        await rental.leaseAll(price, 0, {from: client});
        // assert we got the right number of seats
        assert.equal((await rental.getCurrentTermSeats.call({from: client})).toNumber(), 6);
        assert.equal((await rental.getNextTermSeats.call({from: client})).toNumber(), 0);
        await rental.assertContractState({
            expectedEscrow: provisionAmount - (fiveSeatRent + oneSeatRent),
            expectedRevenue: fiveSeatRent + oneSeatRent,
            expectedClients: [client],
            expectedRenters: [client],
            expectedBids: [[], [], []],
            expectedRent: 1000 * 12 * microDVZ,
            expectedNextTermRent: 1000 * 12 * microDVZ
        });
    });

    it("getAllBidders returns bids in the right order", async () => {
        const rent = await getProratedDues(6, 1);
        const price = (await rental.getPricePerBitCurrentTerm.call()).toNumber();

        // 0 bidders
        let expectedBidTree = [[], [], []];
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());
        // 1 bidders
        await rental.provision(10 + rent, {from: clients[0]});

        await rental.leaseAll(price + 10, 5, {from: clients[0]});
        expectedBidTree[0].push(clients[0]);
        expectedBidTree[1].push(new web3.BigNumber(5));
        expectedBidTree[2].push(new web3.BigNumber(price + 10));
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());

        // add a higher bid
        await rental.provision(10 + rent, {from: clients[1]});
        await rental.leaseAll(price + 12, 2, {from: clients[1]});
        expectedBidTree[0].unshift(clients[1]);
        expectedBidTree[1].unshift(new web3.BigNumber(2));
        expectedBidTree[2].unshift(new web3.BigNumber(price + 12));
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());

        // add a lower bid
        await rental.provision(10 + rent, {from: clients[2]});
        await rental.leaseAll(price, 3, {from: clients[2]});
        expectedBidTree[0].push(clients[2]);
        expectedBidTree[1].push(new web3.BigNumber(3));
        expectedBidTree[2].push(new web3.BigNumber(price));
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());

        // client[2] revises bid up
        await rental.provision(11 + rent, {from: clients[2]});
        await rental.leaseAll(price + 11, 3, {from: clients[2]});
        expectedBidTree[0][1] = clients[2];
        expectedBidTree[1][1] = new web3.BigNumber(3);
        expectedBidTree[2][1] = new web3.BigNumber(price + 11);
        expectedBidTree[0][2] = clients[0];
        expectedBidTree[1][2] = new web3.BigNumber(5);
        expectedBidTree[2][2] = new web3.BigNumber(price + 10);
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());
        assert.equal(3, (await rental.getCurrentTermSeats.call({from: clients[2]})).toNumber());
        assert.equal(3, (await rental.getNextTermSeats.call({from: clients[2]})).toNumber());

        // client[2] releases a seat
        await rental.leaseAll(price + 11, 2, {from: clients[2]});
        expectedBidTree[0][1] = clients[2];
        expectedBidTree[1][1] = new web3.BigNumber(2);
        expectedBidTree[2][1] = new web3.BigNumber(price + 11);
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());
        assert.equal(3, (await rental.getCurrentTermSeats.call({from: clients[2]})).toNumber());
        assert.equal(2, (await rental.getNextTermSeats.call({from: clients[2]})).toNumber());

        // client[2] cancels her bid
        await rental.leaseAll(price + 11, 0, {from: clients[2]});
        expectedBidTree[0][1] = clients[0];
        expectedBidTree[1][1] = new web3.BigNumber(5);
        expectedBidTree[2][1] = new web3.BigNumber(price + 10);
        expectedBidTree[0].pop();
        expectedBidTree[1].pop();
        expectedBidTree[2].pop();
        assert.deepEqual(expectedBidTree, await rental.getAllBidders.call());
    });
});
