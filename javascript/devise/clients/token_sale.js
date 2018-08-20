/*!
 * TokenSale class
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */
const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const get_json_sync = BaseClient.get_json_sync;
const TOKEN_PRECISION = 10 ** 6;
const MILLI_SECOND = 10 ** 3;

/**
 * TokenSale
 * This is the base class for all token sale contract operations
 */
class TokenSale extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    /**
     * Get the start of the token sale from the contract
     * @returns {Promise<Date>}
     */
    async opening_time() {
        const timestamp = await this._token_sale_contract.methods.openingTime().call();
        return new Date(timestamp * MILLI_SECOND);
    }

    /**
     * Get the end of the token sale from the contract
     * @returns {Promise<Date>}
     */
    async closing_time() {
        const timestamp = await this._token_sale_contract.methods.closingTime().call();
        return new Date(timestamp * MILLI_SECOND);
    }

    /**
     * Get the current conversion rate from Ether to DVZ tokens
     * @returns {Promise<number>}
     */
    async eth_dvz_rate() {
        const rate = await this._token_sale_contract.methods.getCurrentRate().call();
        return parseInt(rate);
    }

    /**
     * Estimate the current number of tokens per USD based on current Ether to USD prices
     * @returns {Promise<number>}
     */
    async usd_dvz_rate() {
        const data = get_json_sync("https://api.gdax.com/products/ETH-USD/ticker");
        const prc = parseInt(data['price']);
        const eth_rate = await this.eth_dvz_rate();
        const usd_rate = eth_rate / prc;
        return usd_rate;
    }

    /**
     * Check if this token sale has closed
     * @returns {Promise<bool>}
     */
    has_closed() {
        return this._token_sale_contract.methods.hasClosed().call();
    }

    /**
     * Check for the remaining DVZ tokens available for sale
     * @returns {Promise<number>}
     */
    async remaining_tokens() {
        const rem = await this._token_sale_contract.methods.remainingTokens().call();
        return rem / TOKEN_PRECISION;
    }

    _has_min_order_size(ethers) {
        return this._token_sale_contract.methods.hasMinimumOrderSize(this.web3.toWei(ethers, "ether"));
    }

    /**
     * Calculate Ether cost to obtain a number of DVZ Tokens
     * @param dvz The number of DVZ tokens
     * @returns {Promise<number>}
     */
    async ether_cost(dvz) {
        const rate = await this.eth_dvz_rate();
        return dvz / rate + 1 / (rate * TOKEN_PRECISION);
    }

    /**
     * Check if the client specified is whitelisted on the contract to purchase DVZ Tokens
     * @param client
     * @returns {Promise<bool>}
     */
    is_on_white_list(client) {
        return this._token_sale_contract.methods.whitelist(client).call();
    }

    /**
     * Utility function to query the Ether balance of the contract owner
     * @returns {Promise<number>}
     */
    async get_owner_eth_balance() {
        const owner = await this._token_sale_contract.methods.owner().call();
        return await this.get_eth_balance(owner);
    }

    /**
     * Query the address of the token wallet from which DVZ Tokens are sold by this token sale contract
     * @returns {Promise<string>}
     */
    async get_wallet() {
        return await this._token_sale_contract.methods.wallet().call();
    }
}

module.exports = TokenSale;
