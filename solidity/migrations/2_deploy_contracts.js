const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DeviseToken = artifacts.require("./DeviseToken");

module.exports = function (deployer, network, accounts) {
    const initialRate = new web3.BigNumber(16000);
    const finalRate = new web3.BigNumber(8000);
    const microDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;
    const isProduction = false;
    let openingTime;
    let closingTime;
    if (isProduction) {
        // 07/01/2018 12:00:00am
        openingTime = 1530403200;
        // 10/01/2018 12:00:00am
        closingTime = 1538352000;
    }
    else {
        // 05/01/2018 12:00:00am
        openingTime = 1525132800;
        // 10/01/2019 12:00:00am
        closingTime = 1569888000;
    }
    const pitai = accounts[0];
    const tokenOwner = accounts[1];
    const tokenWallet = accounts[2];
    // total cap is 10 billion and the decimal is 6
    const cap = 10 * billionDVZ * microDVZ;

    deployer.deploy(DeviseToken, cap, {from: pitai}).then(async function () {
        const token = await DeviseToken.deployed();
        await token.transferOwnership(tokenOwner, {from: pitai});
        return deployer.deploy(DeviseTokenSale, tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {
            from: pitai
        }).then(async function () {
            const saleAmount = 1 * billionDVZ * microDVZ;
            await token.mint(tokenWallet, saleAmount, {from: tokenOwner});
            const tokensale = await DeviseTokenSale.deployed();
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
        });
    });
};
