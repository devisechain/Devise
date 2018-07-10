const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const DeviseRental_v1 = artifacts.require("./test/DeviseRentalImpl");
const DeviseToken = artifacts.require("./DeviseToken");
const DateTime = artifacts.require("./DateTime");
const moment = require('moment');
const {timeTravel, evmSnapshot, evmRevert, timestampToDate} = require('./test-utils');
const leptons = require('./leptons');
const assertRevert = require('./helpers/assertRevert');

const pitai = web3.eth.accounts[0];
const clients = web3.eth.accounts.slice(3);
let token;
let rental;
let proxy;
let testSnapshotId = 0;
let estor;

async function setupFixtures() {
    // Setup all the contracts
    const cap = 10 * 10 ** 9 * 10 ** 6;
    token = await DeviseToken.new(cap, {from: pitai});
    dateTime = await DateTime.deployed();
    estor = await DeviseEternalStorage.new();
    // Create new upgradeable contract frontend (proxy)
    proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, {from: pitai});
    // Set it's implementation version
    await proxy.upgradeTo('2', (await DeviseRental_v1.new()).address);
    // Use implementation functions with proxy address
    rental = DeviseRental_v1.at(proxy.address);

    // test addLepton can't be called prior to authorize
    await assertRevert(rental.addLepton(leptons[0], '', 1000000 * (3)));
    await estor.authorize(proxy.address);

    // move forward 1 month
    await timeTravel(86400 * 31);
    // snapshot the blockchain
    testSnapshotId = (await evmSnapshot()).result;
}

contract("DeviseRentalImpl", () => {
    before(setupFixtures);
    // reset to our fixtures state after each test
    afterEach(async () => {
        evmRevert(testSnapshotId);
        // workaround ganache/testrpc crash
        testSnapshotId = (await evmSnapshot()).result;
    });

    it("Can add master node", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        const masterNodes = await rental.getMasterNodes.call();
        assert.deepEqual([clients[1]], masterNodes);
    });

    it("Only owner can add master node", async () => {
        await assertRevert(rental.addMasterNode(clients[1], {from: clients[1]}));
        await rental.addMasterNode(clients[1], {from: pitai});
        await assertRevert(rental.addMasterNode(clients[1], {from: clients[1]}));
    });

    it("Only owner can remove a master node", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await assertRevert(rental.removeMasterNode(clients[1], {from: clients[1]}));
    });

    it("Can remove master node", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await rental.addMasterNode(clients[2], {from: pitai});
        await rental.addMasterNode(clients[3], {from: pitai});
        const masterNodes1 = await rental.getMasterNodes.call();
        assert.deepEqual([clients[1], clients[2], clients[3]], masterNodes1);
        await rental.removeMasterNode(clients[1], {from: pitai});
        const masterNodes2 = await rental.getMasterNodes.call();
        assert.deepEqual([clients[3], clients[2]], masterNodes2);
        await rental.removeMasterNode(clients[2], {from: pitai});
        const masterNodes3 = await rental.getMasterNodes.call();
        assert.deepEqual([clients[3]], masterNodes3);
        await rental.removeMasterNode(clients[3], {from: pitai});
        const masterNodes4 = await rental.getMasterNodes.call();
        assert.deepEqual([], masterNodes4);
    });

    it("Only a master node can add Leptons", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await assertRevert(rental.addLepton(leptons[0], '', 1000000, {from: clients[2]}));
        const tx1 = await rental.addLepton(leptons[0], '', 1000000, {from: clients[1]});
        await assertRevert(rental.addLepton(leptons[1], leptons[0], 1000000, {from: clients[2]}));
        console.log("Gas used to add first lepton: " + tx1["receipt"]["gasUsed"]);
        console.log("Adding second lepton...");
        const tx2 = await rental.addLepton(leptons[1], leptons[0], 1000000, {from: clients[1]});
        console.log("Gas used to add second lepton: " + tx2["receipt"]["gasUsed"]);
        const tx3 = await rental.addLepton(leptons[2], leptons[1], 1000000, {from: clients[1]});
        console.log("Gas used to add third lepton: " + tx3["receipt"]["gasUsed"]);
        const firstLepton = await rental.getLepton(0);
        const secondLepton = await rental.getLepton(1);
        assert.deepEqual([leptons[0], 1000000], [firstLepton[0], firstLepton[1].toNumber()]);
        assert.deepEqual([leptons[1], 1000000], [secondLepton[0], secondLepton[1].toNumber()]);
    });

    it("Leptons can only be added if prevLepton matches last lepton in the chain", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await rental.addLepton(leptons[0], '', 1000000, {from: clients[1]});
        console.log("Adding third lepton out of order...");
        await assertRevert(rental.addLepton(leptons[2], leptons[1], 1000000, {from: clients[1]}));
    });

    it("No duplicate Lepton can be added", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await rental.addLepton(leptons[0], '', 1000000, {from: clients[1]});
        console.log("Adding duplicate lepton...");
        await assertRevert(rental.addLepton(leptons[0], '', 1000000, {from: clients[1]}));
    });

});