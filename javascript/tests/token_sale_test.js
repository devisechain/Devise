const chai = require('chai');
const assert = chai.assert;
const TokenSale = require('../devise/clients/token_sale');

describe('TokenSaleTests', function () {
    this.timeout(20000);
    let tokenSale;
    beforeEach(async () => {
        tokenSale = new TokenSale(undefined, undefined, 'DEV1');
        await tokenSale.init_contracts();
    });
    it('OpeningTime should be at a specific date', async () => {
        const opening = await tokenSale.opening_time();
        assert.equal(opening.getFullYear(), 2018);
        assert.equal(opening.getUTCMonth(), 7 - 1);
        assert.equal(opening.getUTCDate(), 1);
    });
    it('ClosingTime should be at a specific date', async () => {
        const closing = await tokenSale.closing_time();
        assert.equal(closing.getFullYear(), 2018);
        assert.equal(closing.getUTCMonth(), 10 - 1);
        assert.equal(closing.getUTCDate(), 1);
    });
    it('Ether DVZ rate should be in a range', async () => {
        const rate = await tokenSale.eth_dvz_rate();
        assert.isAtMost(rate, 16000);
    });
    it('HasClosed should return false', async () => {
        const status = await tokenSale.has_closed();
        assert.isFalse(status);
    });
    it('RemainingTokens should be greater then zero', async () => {
        const rem = await tokenSale.remaining_tokens();
        assert.isAbove(rem, 0);
    });
    it('EtherCost should be in a range', async () => {
        const dvz = 16000;
        const cost = await tokenSale.ether_cost(dvz);
        assert.isAbove(cost, 1);
    });
    it('IsOnWhiteList should be false for random address', async () => {
        const addr = '0x0';
        const status = await tokenSale.is_on_white_list(addr);
        assert.isFalse(status);
    });
});
