const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const IU_PRECISION = 10 ** 6;

class MasterNode extends BaseDeviseClient {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    get_master_nodes() {
        return this._rental_contract.methods.getMasterNodes().call();
    }
}

module.exports = MasterNode;
