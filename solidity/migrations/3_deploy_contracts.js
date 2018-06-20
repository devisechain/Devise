const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
const DateTime = artifacts.require("./DateTime");
const DeviseToken = artifacts.require("./DeviseToken");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const DeviseTokenSale = artifacts.require("./DeviseTokenSale");

module.exports = function (deployer, network, accounts) {
    const pitai = accounts[0];
    const escrowWallet = accounts[3];
    const revenueWallet = accounts[4];

    deployer.deploy(DateTime, {from: pitai}).then(function () {
        return deployer.deploy(DeviseEternalStorage, {from: pitai}).then(function () {
            return deployer.deploy(DeviseRentalProxy, DeviseToken.address, DateTime.address, DeviseEternalStorage.address, {from: pitai}).then(function () {
                return deployer.deploy(DeviseRentalImpl, {from: pitai}).then(function () {
                    DeviseEternalStorage.deployed().then(async function (des) {
                        await des.authorize((await DeviseRentalProxy.deployed()).address, {from: pitai});
                        const proxy = await DeviseRentalProxy.deployed();
                        await proxy.upgradeTo('1.0', DeviseRentalImpl.address);
                        const tokensale = await DeviseTokenSale.deployed();
                        await tokensale.setRentalProxy(proxy.address);
                        const rentalProxy = await DeviseRentalImpl.at(proxy.address);
                        await rentalProxy.setEscrowWallet(escrowWallet);
                        await rentalProxy.setRevenueWallet(revenueWallet);
                    });
                });
            });
        });
    });
};
