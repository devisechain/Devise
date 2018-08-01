const chai = require('chai');
const assert = chai.assert;
const MasterNode = require('../devise/miners/master_node');

describe('MasterNodeTest', function () {
    this.timeout(10000);
    let master;
    beforeEach(async () => {
        master = new MasterNode(undefined, undefined, 'DEV1');
        await master.init_contracts();
    });
    it('GetMasterNodes should return an array of objects', async () => {
        const nodes = await master.get_master_nodes();
        assert.isAtLeast(nodes.length, 1);
    });
});
