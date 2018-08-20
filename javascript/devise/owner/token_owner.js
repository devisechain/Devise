/*!
 * DeviseTokenOwner class
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */
const DeviseToken = require('../clients/token');

/**
 * DeviseTokenOwner
 * Smart Contract wrapper class for Token Owner operations
 */
class DeviseTokenOwner extends DeviseToken {
    constructor(account, nodel_url, network) {
        super(account, nodel_url, network);
    }

    async get_minters() {
        let minters = [];
        const owner = await this._token_contract.methods.owner().call();
        const n = await this._token_contract.methods.getNumberOfMinters().call({from: owner});
        for (let i = 0; i < n; i++) {
            const minter = await this._token_contract.methods.getMinter(i).call({from: owner});
            minters.push(minter);
        }
        return minters;
    }
}

module.exports = DeviseTokenOwner;
