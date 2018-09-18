/*!
 * Base classes BaseEthereumClient, BaseDeviseClient and related functions
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */

// Node.js doesn't have XHR, shim it
if (typeof XMLHttpRequest === 'undefined') {
    global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}

let Web3 = require('web3');
const ETHER_PRECISION = 10 ** 18;

// The following code is to accommodate using jQuery in Node.js
const GITHUB_USERNAME = 'devisechain';
const REPO_VERSION = '6c5e4852045522a416bea23cc7a816b1ae79b668';
const CDN_ROOT = 'https://cdn.jsdelivr.net/gh/' + GITHUB_USERNAME + '/Devise@' + REPO_VERSION + '/config/';
const CONFIG_URL = 'https://config.devisefoundation.org/config.json';

const get_json_sync = function (url) {
    let res;
    const request = new XMLHttpRequest();
    request.open('GET', url, false);  // `false` makes the request synchronous
    request.send(null);

    if (request.status === 200) {
        return JSON.parse(request.responseText);
    }
};

const get_contract_abi = function (contractName) {
    const url = CDN_ROOT + 'abi/' + contractName + '.json';
    const data = get_json_sync(url);
    return data;
};

const get_contract_address = function () {
    const config = get_json_sync(CONFIG_URL);
    return config["CONTRACT_ADDRESSES"];
};

const get_default_node_url = function (network = 'MAINNET') {
    const config = get_json_sync(CONFIG_URL);
    return config["NETWORK_TO_NODE"][network.toUpperCase()];
};

class BaseEthereumClient {
    /**
     * Constructor
     * @param account default: none, optional address to query the smart contract as
     * @param node_url default: auto, optional ethereum node from which to query smart contract information
     * @param network default: MainNet, optional network to connect to
     */
    constructor(account, node_url, network) {
        if (!network) {
            network = 'MAINNET'
        }
        node_url = node_url || get_default_node_url(network);
        account = account || '0x0000000000000000000000000000000000000000';
        const provider = new Web3.providers.HttpProvider(node_url);
        this.web3 = new Web3(provider);
        if (this.web3.eth.net === undefined)
            throw "Please use a version of web3.js >= 1.0.0.";

        this.account = account;
        this.address = this.account;
    }

    async _get_network_id() {
        const id = await this.web3.eth.net.getId();
        return id;
    }

    async get_eth_balance(address) {
        if (address === undefined)
            return 0;
        const bal = await this.web3.eth.getBalance(address) / ETHER_PRECISION;
        return bal;
    }

}

class BaseDeviseClient extends BaseEthereumClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    async init_contracts() {
        const token_abi = get_contract_abi('devise_token');
        let rental_abi = get_contract_abi('devise_rental_proxy');
        const contract_address = get_contract_address();
        const network_id = await this._get_network_id();
        this._token_contract = new this.web3.eth.Contract(token_abi, contract_address[network_id].DEVISE_TOKEN);
        this._rental_contract = new this.web3.eth.Contract(rental_abi, contract_address[network_id].DEVISE_RENTAL);
    }
}

module.exports = {BaseEthereumClient, BaseDeviseClient, get_json_sync};
