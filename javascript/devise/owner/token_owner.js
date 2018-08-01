const DeviseToken = require('../clients/token');

class DeviseTokenOwner extends DeviseToken {
    constructor(account, nodel_url, network) {
        super(account, nodel_url, network);
    }

    async get_minters() {
        let minters = [];
        console.log('Before function call');
        const n = await this._token_contract.methods.getNumberOfMinters().call({from: this.address});
        console.log('After function call');
        for (let i = 0; i < n; i++) {
            const minter = await this._token_contract.methods.getMinter(i).call({from: this.address});
            minters.push(minter);
        }
        return minters;
    }
}

module.exports = DeviseTokenOwner;
