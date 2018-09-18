const DeviseToken = artifacts.require("./DeviseToken");
const MintableTokenTest = artifacts.require("./test/MintableTokenTest");

module.exports = function (deployer, network, accounts) {
    const microDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;
    const pitai = accounts[0];
    const tokenOwner = accounts[1];
    const tokenWallet = accounts[2];
    // total cap is 10 billion and the decimal is 6
    const cap = 10 * billionDVZ * microDVZ;

    deployer.deploy(DeviseToken, cap, {from: pitai}).then(async function () {
        const token = await DeviseToken.deployed();
        await token.transferOwnership(tokenOwner, {from: pitai});
        await deployer.deploy(MintableTokenTest, cap, {from: pitai});
        const saleAmount = 1 * billionDVZ * microDVZ;
        await token.mint(tokenWallet, saleAmount, {from: tokenOwner});
    });
};