const chai = require('chai');
const assert = chai.assert;
const MasterNode = require('../devise/miners/master_node');
const network = 'ganache';

describe('MasterNodeTest', function () {
    this.timeout(10000);
    let master;
    beforeEach(async () => {
        master = new MasterNode(undefined, undefined, network);
        await master.init_contracts();
    });
    it('GetMasterNodes should return an array of objects', async () => {
        const nodes = await master.get_master_nodes();
        assert.deepEqual(nodes, ['0xd4a6B94E45B8c0185e33F210f4F96bDAe40aa22E']);
    });
});
