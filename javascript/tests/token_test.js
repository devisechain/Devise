const chai = require('chai');
const assert = chai.assert;
const DeviseToken = require('../devise/clients/token');

describe('DeviseTokenTests', function () {
    this.timeout(10000);
    let token;
    beforeEach(async () => {
        token = new DeviseToken(undefined, undefined, 'DEV1');
        await token.init_contracts();
    });
    it('Cap should be non-zero', async () => {
        const cap = (await token.cap()) / 10 ** 6;
        assert.equal(cap, 10 * 10 ** 9);
    });
    it('TotalSupply should be non-zero', async () => {
        const totalSupply = (await token.total_supply()) / 10 ** 6;
        assert.isAtLeast(totalSupply, 250 * 10 ** 6);
    });
    it('Allowance should be zero by default', async () => {
        const owner = '0x0';
        const spender = '0x0';
        const allowance = (await token.allowance(owner, spender));
        assert.equal(allowance, 0);
    });
    it('Allowance should be non-zero for specific accounts', async () => {
        const owner = '0x794f74c8916310d6a0009bb8a43a5acab59a58ad';
        const spender = '0xA76068c461716d34499cA221A037Cedb39067e26';
        const allowance = (await token.allowance(owner, spender)) / 10 ** 6;
        assert.isAtLeast(allowance, 3000);
    });
    it('Balance should be zero for random account', async () => {
        const addr = '0x0';
        const bal = await token.balance_of(addr);
        assert.equal(bal, 0);
    });
    it('Balance should be non-zero for specific account', async () => {
        const addr = '0x794f74c8916310d6a0009bb8a43a5acab59a58ad';
        const bal = (await token.balance_of(addr)) / 10 ** 6;
        assert.isAtLeast(bal, 250 * 10 ** 6);
    });
});
