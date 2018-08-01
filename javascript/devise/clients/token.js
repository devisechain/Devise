const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;

class DeviseToken extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    cap() {
        return this._token_contract.methods.cap().call();
    }

    total_supply() {
        return this._token_contract.methods.totalSupply().call();
    }

    allowance(owner, spender) {
        return this._token_contract.methods.allowance(owner, spender).call();
    }

    balance_of(address) {
        return this._token_contract.methods.balanceOf(address).call();
    }
}

module.exports = DeviseToken;
