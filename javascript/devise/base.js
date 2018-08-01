// Node.js doesn't have XHR, shim it
if (typeof XMLHttpRequest === 'undefined') {
    global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}

let Web3 = require('web3');
const assert = require('assert');

// The following code is to accommodate using jQuery in Node.js
const GITHUB_USERNAME = 'devisechain';
const REPO_VERSION = 'd0fcf82f472fde7beb4b83d5e5bf4e9756827dca';
const CDN_ROOT = 'https://cdn.jsdelivr.net/gh/' + GITHUB_USERNAME + '/Devise@' + REPO_VERSION + '/config/';


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
    const url = CDN_ROOT + 'contract_address.json';
    const data = get_json_sync(url);
    return data;
};

const get_default_node_url = function (network = 'MAINNET') {
    const url = CDN_ROOT + 'network_to_node.json';
    let NETWORK_TO_NODE;
    NETWORK_TO_NODE = get_json_sync(url);
    network = network.toUpperCase();
    return NETWORK_TO_NODE[network];
};

class BaseEthereumClient {
    constructor(account, node_url, network) {
        assert(node_url || network, "Either node_url or network has to be set.");
        node_url = node_url || get_default_node_url(network);
        account = account || '0x0000000000000000000000000000000000000000';
        const provider = new Web3.providers.HttpProvider(node_url);
        this.web3 = new Web3(provider);
        assert(this.web3.eth.net, "Please use a version of web3.js >= 1.0.0.");

        this.account = account;
        this.address = this.account;
    }

    async _get_network_id() {
        const id = await this.web3.eth.net.getId();
        return id;
    }

}

class BaseDeviseClient extends BaseEthereumClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    async init_contracts() {
        const tokenABI = get_contract_abi('devise_token');
        const tokenSaleABI = get_contract_abi('devise_token_sale');
        const rentalABI = get_contract_abi('devise_rental_proxy');
        const CONTRACT_ADDRESS = get_contract_address();
        const networkID = await this._get_network_id();
        this._token_contract = new this.web3.eth.Contract(tokenABI, CONTRACT_ADDRESS[networkID].DEVISE_TOKEN);
        this._token_sale_contract = new this.web3.eth.Contract(tokenSaleABI, CONTRACT_ADDRESS[networkID].DEVISE_TOKEN_SALE);
        this._rental_contract = new this.web3.eth.Contract(rentalABI, CONTRACT_ADDRESS[networkID].DEVISE_RENTAL);
    }
}

module.exports = {BaseEthereumClient, BaseDeviseClient};
