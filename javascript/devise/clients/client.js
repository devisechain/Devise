const aggregation = require("aggregation/es6");
const DeviseToken = require('./token');
const TokenSale = require('./token_sale');
const RentalContract = require('./contract');

class DeviseClient extends aggregation(DeviseToken, TokenSale, RentalContract) {
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }
}

module.exports = DeviseClient;
