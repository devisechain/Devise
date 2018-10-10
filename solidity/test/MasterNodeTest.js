const setupFixturesHelper = require('./helpers/setupFixtures');
const {timeTravel, evmSnapshot, evmRevert} = require('./test-utils');
const leptons = require('./leptons');
const assertRevert = require('./helpers/assertRevert');

const pitai = web3.eth.accounts[0];
const tokenWallet = web3.eth.accounts[1];
const escrowWallet = web3.eth.accounts[2];
const revenueWallet = web3.eth.accounts[3];
const clients = web3.eth.accounts.slice(4);

let rental;
let lepton;
let testSnapshotId = 0;

async function setupFixtures() {
    ({
        rental,
        lepton
    } = await setupFixturesHelper(pitai, escrowWallet, tokenWallet, revenueWallet, null, true, false));
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
        const masterNodes = await lepton.getMasterNodes.call();
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

    it("Can get all leptons at once", async () => {
        await rental.addMasterNode(clients[1], {from: pitai});
        await rental.addLepton(leptons[0], '', 1000000, {from: clients[1]});
        await rental.addLepton(leptons[1], leptons[0], 900000, {from: clients[1]});
        const [hashes, incrementalUsefulnesses] = await rental.getAllLeptons.call();
        assert.deepEqual(hashes, [leptons[0], leptons[1]]);
        assert.deepEqual(incrementalUsefulnesses, [new web3.BigNumber(1000000), new web3.BigNumber(900000)]);
    });
});