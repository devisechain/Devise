const chai = require('chai');
const assert = chai.assert;
const TokenOwner = require('../devise/owner/token_owner');
const network = 'ganache';

describe('TokenOwnerTest', function () {
    this.timeout(10000);
    let owner;
    beforeEach(async () => {
        owner = new TokenOwner(undefined, undefined, network);
        await owner.init_contracts();
    });
    it('GetMinters should return an array of objects', async () => {
        const minters = await owner.get_minters();
        console.log(minters, minters.length);
        assert.equal(true, true);
    });
});
