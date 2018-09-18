/*!
 * DeviseToken class
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */
const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const TOKEN_PRECISION = 10 ** 6;

/**
 * DeviseToken
 * This is the base class for all token contract operations
 */
class DeviseToken extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    /**
     * The global cap on how many DVZ tokens can be minted
     * @returns {Promise<number>}
     */
    async cap() {
        return await this._token_contract.methods.cap().call() / TOKEN_PRECISION;
    }

    /**
     * The current number of DVZ Tokens in circulation
     * @returns {Promise<number>}
     */
    async total_supply() {
        return await this._token_contract.methods.totalSupply().call() / TOKEN_PRECISION;
    }

    /**
     *
     * @param owner
     * @param spender
     * @returns {Promise<number>}
     */
    async allowance(owner, spender) {
        return await this._token_contract.methods.allowance(owner, spender).call() / TOKEN_PRECISION;
    }

    /**
     * Query the DVZ token balance the specified address
     * @param address
     * @returns {Promise<number>}
     */
    async balance_of(address) {
        return await this._token_contract.methods.balanceOf(address).call() / TOKEN_PRECISION;
    }

    /**
     * Utility function to query the DVZ token balance of the token sale wallet
     * @returns {Promise<number>}
     */
    async balance_of_token_wallet() {
        const owner = await this._rental_contract.methods.tokenWallet().call();
        return await this.balance_of(owner);
    }

    // TODO replace with allowance of rental contract from tokenSaleWallet
    // /**
    //  * Utility function to query the allowance of the token sale contract
    //  * @returns {Promise<number>}
    //  */
    // async allowance_of_token_sale_contract() {
    //     const owner = await this._rental_contract.methods.tokenWallet().call();
    //     const spender = await this._token_sale_contract._address;
    //     return await this.allowance(owner, spender);
    // }

    /**
     * Utility function to query the Ether balance of the contract owner
     * @returns {Promise<number|*>}
     */
    async get_owner_eth_balance() {
        const owner = await this._token_contract.methods.owner().call();
        return await this.get_eth_balance(owner);
    }
}

module.exports = DeviseToken;
