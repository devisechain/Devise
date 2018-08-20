const chai = require('chai');
const assert = chai.assert;
const TokenSale = require('../devise/clients/token_sale');
const network = 'ganache';

describe('TokenSaleTests', function () {
    this.timeout(20000);
    let token_sale;
    beforeEach(async () => {
        token_sale = new TokenSale(undefined, undefined, network);
        await token_sale.init_contracts();
    });
    it('OpeningTime should be at a specific date', async () => {
        const opening = await token_sale.opening_time();
        assert.equal(opening.getFullYear(), 2018);
        assert.equal(opening.getUTCMonth(), 5 - 1);
        assert.equal(opening.getUTCDate(), 1);
    });
    it('ClosingTime should be at a specific date', async () => {
        const closing = await token_sale.closing_time();
        assert.equal(closing.getFullYear(), 2019);
        assert.equal(closing.getUTCMonth(), 10 - 1);
        assert.equal(closing.getUTCDate(), 1);
    });
    it('Ether DVZ rate should be in a range', async () => {
        const rate = await token_sale.eth_dvz_rate();
        assert.isAtMost(rate, 16000);
    });
    it('HasClosed should return false', async () => {
        const status = await token_sale.has_closed();
        assert.isFalse(status);
    });
    it('RemainingTokens should be greater then zero', async () => {
        const rem = await token_sale.remaining_tokens();
        assert.isAbove(rem, 0);
    });
    it('EtherCost should be in a range', async () => {
        const dvz = 16000;
        const cost = await token_sale.ether_cost(dvz);
        assert.isAbove(cost, 1);
    });
    it('IsOnWhiteList should be false for random address', async () => {
        const addr = '0x0';
        const status = await token_sale.is_on_white_list(addr);
        assert.isFalse(status);
    });
    it('USD DVZ rate should be in a range', async () => {
        const rate = await token_sale.usd_dvz_rate();
        assert.isAtLeast(rate, 20);
    });
    it('get_owner_eth_balance should not throw exception', async () => {
        const bal = await token_sale.get_owner_eth_balance();
        assert.isAtLeast(bal, 0);
    });
    it('get_wallet should return a non-zero address', async () => {
        const wallet = await token_sale.get_wallet();
        assert.notEqual(wallet, '0x0');
    });
});
