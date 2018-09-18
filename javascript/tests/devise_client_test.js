const chai = require('chai');
const assert = chai.assert;
const DeviseClient = require('../devise/clients/client');
const network = 'ganache';

describe('DeviseClientTest', function () {
    this.timeout(10000);
    let client;
    beforeEach(async () => {
        client = new DeviseClient(undefined, undefined, network);
        await client.init_contracts();
    });
    it('Should be able to call cap from DevivseToken', async () => {
        const cap = await client.cap();
        assert.equal(cap, 10 * 10 ** 9);
    });
    it('Should be able to call current_lease_term from RentalContract', async () => {
        const term = await client.current_lease_term();
        console.log("Current lease term ", term);
        assert.isDefined(term);
    });
    it('Should be able to set node_url', () => {
        const node_url = 'https://mainnet.infura.io/ZQl920lU4Wyl6vyrND55';
        client = new DeviseClient('0x0000000000000000000000000000000000000000', node_url);
        const provider = client.web3.currentProvider.host;
        assert.equal(provider, node_url)
    });
    it('get_eth_usd_rate should return zero', async () => {
        const rate = await client.get_eth_usd_rate();
        assert.equal(rate, 0);
    });
    it('get_usd_dvz_rate shoudl return 10', async () => {
        const rate = await client.get_usd_dvz_rate();
        assert.equal(rate, 10);
    });
    it('get_eth_dvz_rate should return zero', async () => {
        const rate = await client.get_eth_dvz_rate();
        assert.equal(rate, 0);
    });
});
