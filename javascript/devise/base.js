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
const assert = require('assert');
const ETHER_PRECISION = 10 ** 18;

// The following code is to accommodate using jQuery in Node.js
const GITHUB_USERNAME = 'devisechain';
const REPO_VERSION = '9aefe86d422bb86ed65fbd09817eabd5eac6d61a';
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
    let network_to_node;
    network_to_node = get_json_sync(url);
    network = network.toUpperCase();
    return network_to_node[network];
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
        assert(this.web3.eth.net, "Please use a version of web3.js >= 1.0.0.");

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
        const token_sale_abi = get_contract_abi('devise_token_sale');
        const rental_abi = get_contract_abi('devise_rental_proxy');
        const contract_address = get_contract_address();
        const network_id = await this._get_network_id();
        this._token_contract = new this.web3.eth.Contract(token_abi, contract_address[network_id].DEVISE_TOKEN);
        this._token_sale_contract = new this.web3.eth.Contract(token_sale_abi, contract_address[network_id].DEVISE_TOKEN_SALE);
        this._rental_contract = new this.web3.eth.Contract(rental_abi, contract_address[network_id].DEVISE_RENTAL);
    }
}

module.exports = {BaseEthereumClient, BaseDeviseClient, get_json_sync};
