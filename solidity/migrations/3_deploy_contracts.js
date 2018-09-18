const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
const DateTime = artifacts.require("./DateTime");
const DeviseToken = artifacts.require("./DeviseToken");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");

module.exports = function (deployer, network, accounts) {
    const pitai = accounts[0];
    const tokenWallet = accounts[2];
    const escrowWallet = accounts[3];
    const revenueWallet = accounts[4];
    const microDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;

    deployer.deploy(DateTime, {from: pitai}).then(function () {
        return deployer.deploy(DeviseEternalStorage, {from: pitai}).then(function () {
            return deployer.deploy(DeviseRentalProxy, DeviseToken.address, DateTime.address, DeviseEternalStorage.address, 0, {from: pitai}).then(function () {
                return deployer.deploy(DeviseRentalImpl, {from: pitai}).then(function () {
                    DeviseEternalStorage.deployed().then(async function (des) {
                        const token = await DeviseToken.deployed();
                        await des.authorize((await DeviseRentalProxy.deployed()).address, {from: pitai});
                        const proxy = await DeviseRentalProxy.deployed();
                        await proxy.upgradeTo(DeviseRentalImpl.address);
                        const rentalProxy = await DeviseRentalImpl.at(proxy.address);
                        await rentalProxy.setEscrowWallet(escrowWallet);
                        await rentalProxy.setRevenueWallet(revenueWallet);
                        await rentalProxy.setTokenWallet(tokenWallet);
                        await rentalProxy.addMasterNode(pitai);
                        const saleAmount = 1 * billionDVZ * microDVZ;
                        await token.approve(rentalProxy.address, saleAmount, {from: tokenWallet});
                    });
                });
            });
        });
    });
};
