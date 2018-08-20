let chai = require('chai');
let assert = chai.assert;
let BaseClient = require('../devise/base');
const network = 'ganache';

describe('BaseClientTests', function () {
    this.timeout(10000);
    it('CurrentProvider should be set', () => {
        let BaseEthereumClient = BaseClient.BaseEthereumClient;
        let client = new BaseEthereumClient(undefined, undefined, network);
        const provider = client.web3.currentProvider.host;
        assert.equal(provider, 'http://localhost:8545');
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
        let client = new BaseDeviseClient(undefined, undefined, network);
        await client.init_contracts();
        let contract = client._token_contract;
        assert.isDefined(contract);
    });
    it('get_eth_balance should return non-zero balance for specific address', async () => {
        const BaseEthereumClient = BaseClient.BaseEthereumClient;
        const client = new BaseEthereumClient(undefined, undefined, network);
        const address = '0xd4a6b94e45b8c0185e33f210f4f96bdae40aa22e';
        const bal = await client.get_eth_balance(address);
        assert.isAbove(bal, 0);
    });
});
