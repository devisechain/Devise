const DeviseToken = require('../clients/token');

class DeviseTokenOwner extends DeviseToken {
    constructor(account, nodel_url, network) {
        super(account, nodel_url, network);
    }

    async get_minters() {
        let minters = [];
        const n = await this._token_contract.methods.getNumberOfMinters().call({from: this.address});
        for (let i = 0; i < n; i++) {
            const minter = await this._token_contract.methods.getMinter(i).call({from: this.address});
            minters.push(minter);
        }
        return minters;
    }
}

module.exports = DeviseTokenOwner;
