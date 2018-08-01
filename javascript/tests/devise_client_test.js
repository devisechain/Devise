const chai = require('chai');
const assert = chai.assert;
const DeviseClient = require('../devise/clients/client');

describe('DeviseClientTest', function () {
    this.timeout(10000);
    let client;
    beforeEach(async () => {
        client = new DeviseClient(undefined, undefined, 'DEV1');
        await client.init_contracts();
    });
    it('Should be able to call cap from DevivseToken', async () => {
        const cap = (await client.cap()) / 10 ** 6;
        assert.equal(cap, 10 * 10 ** 9);
    });
    it('Should be able to call opening_time from TokenSale', async () => {
        const opening = await client.opening_time();
        assert.equal(opening.getFullYear(), 2018);
        assert.equal(opening.getUTCMonth(), 7 - 1);
        assert.equal(opening.getUTCDate(), 1);
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
});
