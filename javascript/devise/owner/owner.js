const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const IU_PRECISION = 10 ** 6;
const TOKEN_PRECISION = 10 ** 6;
const ETHER_PRECISION = 10 ** 18;

class DeviseOwner extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    async get_implementation() {
        return await this._rental_contract.methods.implementation().call();
    }

    async get_version() {
        return await this._rental_contract.methods.version().call();
    }

    async get_escrow_history() {
        const res = await this._rental_contract.methods.getEscrowHistory().call();
        return res;
    }

    async get_escrow_version() {
        const hist = await this.get_escrow_history();
        return hist.length;
    }

    async get_revenue_history() {
        const res = await this._rental_contract.methods.getRevenueHistory().call();
        return res;
    }

    async get_revenue_version() {
        const hist = await this.get_revenue_history();
        return hist.length;
    }
}

module.exports = DeviseOwner;
