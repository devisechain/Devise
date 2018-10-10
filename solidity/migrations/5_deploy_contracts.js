const MintableTokenTestBoth = artifacts.require("./test/MintableTokenTestBoth");
const MintableTokenTestBoth1 = artifacts.require("./test/MintableTokenTestBoth1");

module.exports = function (deployer, network, accounts) {
    const pitai = accounts[0];
    // total cap is 1 billion and the decimal is 18
    const cap = 10 ** 9 * 10 ** 18;

    return deployer.deploy(MintableTokenTestBoth, cap, {from: pitai}).then(function () {
        return deployer.deploy(MintableTokenTestBoth1, cap, {from: pitai});
    });
};
