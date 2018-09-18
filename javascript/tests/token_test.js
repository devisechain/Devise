const chai = require('chai');
const assert = chai.assert;
const DeviseToken = require('../devise/clients/token');
const network = 'ganache';

describe('DeviseTokenTests', function () {
    this.timeout(10000);
    let token;
    beforeEach(async () => {
        token = new DeviseToken(undefined, undefined, network);
        await token.init_contracts();
    });
    it('Cap should be non-zero', async () => {
        const cap = await token.cap();
        assert.equal(cap, 10 * 10 ** 9);
    });
    it('TotalSupply should be non-zero', async () => {
        const total_supply = await token.total_supply();
        assert.isAtLeast(total_supply, 250 * 10 ** 6);
    });
    it('Allowance should be zero by default', async () => {
        const owner = '0x99429f64cf4d5837620dcc293c1a537d58729b68';
        const spender = '0xbA809B53AD58dd87903E07b21e6cd00683d62252';
        const allowance = await token.allowance(owner, spender);
        assert.equal(allowance, 0);
    });
    it('Allowance should be non-zero for specific accounts', async () => {
        const owner = await token._rental_contract.methods.escrowWallet().call();
        const spender = token._rental_contract._address;
        const allowance = await token.allowance(owner, spender);
        assert.isAtLeast(allowance, 3000);
    });
    it('Balance should be zero for random account', async () => {
        const addr = '0x99429f64cf4d5837620dcc293c1a537d58729b68';
        const bal = await token.balance_of(addr);
        assert.equal(bal, 0);
    });
    // TODO enable this once we can query tokenWallet on rental contract
    it.skip('Balance should be non-zero for specific account', async () => {
        const addr = await token._rental_contract.methods.escrowWallet().call();
        const bal = await token.balance_of(addr);
        assert.isAtLeast(bal, 250 * 10 ** 6);
    });
    // TODO this should be enabled when the token wallet is added to rental contract
    it.skip('Balance should be non-zero for token wallet account', async () => {
        const bal = await token.balance_of_token_wallet();
        assert.isAtLeast(bal, 250 * 10 ** 6);
    });
    it('get_owner_eth_balance should not throw exception', async () => {
        const bal = await token.get_owner_eth_balance();
        assert.isAtLeast(bal, 0);
    });
});
