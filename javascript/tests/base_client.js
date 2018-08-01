let chai = require('chai');
let assert = chai.assert;
let BaseClient = require('../devise/base');

describe('BaseClientTests', function () {
    this.timeout(10000);
    it('CurrentProvider should be set', () => {
        let BaseEthereumClient = BaseClient.BaseEthereumClient;
        let client = new BaseEthereumClient(undefined, undefined, 'DEV1');
        const provider = client.web3.currentProvider.host;
        assert.equal(provider, 'https://dev1.devisechain.io');
    });
    it('Should be able to set node_url', () => {
        let BaseEthereumClient = BaseClient.BaseEthereumClient;
        const node_url = 'https://mainnet.infura.io/ZQl920lU4Wyl6vyrND55';
        let client = new BaseEthereumClient('0x0000000000000000000000000000000000000000', node_url);
        const provider = client.web3.currentProvider.host;
        assert.equal(provider, node_url)
    });
    it('TokenContract should be defined', async () => {
        let BaseDeviseClient = BaseClient.BaseDeviseClient;
        let client = new BaseDeviseClient(undefined, undefined, 'DEV1');
        await client.init_contracts();
        let contract = client._token_contract;
        assert.isDefined(contract);
    });
});
