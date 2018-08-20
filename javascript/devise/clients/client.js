/*!
 * DeviseClient class
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */
const aggregation = require("aggregation/es6");
const DeviseToken = require('./token');
const TokenSale = require('./token_sale');
const RentalContract = require('./contract');

/*
 * DeviseClient
 * This is the basic wrapper class around all Devise client facing operations. This wrapper connects to an Ethereum
 * node and facilitates smart contract operations such as provision, leaseAll, getBalance, etc.
 */
class DeviseClient extends aggregation(DeviseToken, TokenSale, RentalContract) {
    /**
     * Constructor
     * @param account default: none, optional address to query the smart contract as
     * @param nodel_url default: auto, optional ethereum node from which to query smart contract information
     * @param network default: MainNet, optional network to connect to
     */
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }
}

module.exports = DeviseClient;
