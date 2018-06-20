const MintableTokenTestBoth1 = artifacts.require("./test/MintableTokenTestBoth1");

module.exports = function (deployer, network, accounts) {
    const pitai = accounts[0];
    // total cap is 1 billion and the decimal is 18
    const cap = 10 ** 9 * 10 ** 18;

    deployer.deploy(MintableTokenTestBoth1, cap, {from: pitai});
};
