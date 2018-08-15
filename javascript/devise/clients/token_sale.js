const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const TOKEN_PRECISION = 10 ** 6;
const MILLI_SECOND = 10 ** 3;

class TokenSale extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    async opening_time() {
        const timestamp = await this._token_sale_contract.methods.openingTime().call();
        return new Date(timestamp * MILLI_SECOND);
    }

    async closing_time() {
        const timestamp = await this._token_sale_contract.methods.closingTime().call();
        return new Date(timestamp * MILLI_SECOND);
    }

    async eth_dvz_rate() {
        const rate = await this._token_sale_contract.methods.getCurrentRate().call();
        return parseInt(rate);
    }

    has_closed() {
        return this._token_sale_contract.methods.hasClosed().call();
    }

    async remaining_tokens() {
        const rem = await this._token_sale_contract.methods.remainingTokens().call();
        return rem / TOKEN_PRECISION;
    }

    _has_min_order_size(ethers) {
        return this._token_sale_contract.methods.hasMinimumOrderSize(this.web3.toWei(ethers, "ether"));
    }

    async ether_cost(dvz) {
        const rate = await this.eth_dvz_rate();
        return dvz / rate + 1 / (rate * TOKEN_PRECISION);
    }

    is_on_white_list(client) {
        return this._token_sale_contract.methods.whitelist(client).call();
    }
}

module.exports = TokenSale;
