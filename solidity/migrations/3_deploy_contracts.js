const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
const AccountingStorage = artifacts.require("./AccountingStorage");
const AuctionStorage = artifacts.require("./AuctionStorage");
const AccountingProxy = artifacts.require("./AccountingProxy");
const AuctionProxy = artifacts.require("./AuctionProxy");
const AccountingImpl = artifacts.require("./Accounting");
const AuctionImpl = artifacts.require("./Auction");
const LeptonStorage = artifacts.require("./LeptonStorage");
const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
const DeviseMiningProxy = artifacts.require("./DeviseMiningProxy");
const DeviseMiningImpl = artifacts.require("./DeviseMiningImpl");
const AuditProxy = artifacts.require("./AuditProxy");
const AuditImpl = artifacts.require("./AuditImpl");
const DateTime = artifacts.require("./DateTime");
const DeviseToken = artifacts.require("./DeviseToken");
const AccessControlStorage = artifacts.require("./AccessControlStorage");
const AccessControlProxy = artifacts.require("./AccessControlProxy");
const AccessControlImpl = artifacts.require("./AccessControl");

module.exports = function (deployer, network, accounts) {
    const pitai = accounts[0];
    const tokenWallet = accounts[2];
    const escrowWallet = accounts[3];
    const revenueWallet = accounts[4];
    const microDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;

    // DateTime contract
    return deployer.deploy(DateTime, {from: pitai}).then(async function (dateTime) {
        // Devise token
        const token = await DeviseToken.deployed();
        const leptonStorage = await deployer.deploy(LeptonStorage, {from: pitai});

        // Main entry point Rental proxy and implementation
        const rentalProxy = await deployer.deploy(DeviseRentalProxy, token.address, {from: pitai});
        const rentalImpl = await deployer.deploy(DeviseRentalImpl, {from: pitai});
        const rental = DeviseRentalImpl.at(rentalProxy.address);
        await rentalProxy.upgradeTo(rentalImpl.address);

        // Deploying audit contract
        const auditProxy = await deployer.deploy(AuditProxy, {from: pitai});
        const auditImpl = await deployer.deploy(AuditImpl, {from: pitai});
        await auditProxy.upgradeTo(auditImpl.address);

        // Lepton Storage and Mining contracts
        const miningProxy = await deployer.deploy(DeviseMiningProxy, leptonStorage.address, {from: pitai});
        await leptonStorage.authorize(miningProxy.address, {from: pitai});
        const mininigImpl = await deployer.deploy(DeviseMiningImpl, {from: pitai});
        await miningProxy.upgradeTo(mininigImpl.address, {from: pitai});
        const mining = DeviseMiningImpl.at(miningProxy.address);
        // setting up rental proxy implementation and initializing it
        await rental.setLeptonProxy(miningProxy.address, {from: pitai});
        await mining.authorize(rentalProxy.address, {from: pitai});

        // Deploying accounting contract
        const accountingStorage = await deployer.deploy(AccountingStorage, {from: pitai});
        const accountingProxy = await deployer.deploy(AccountingProxy, token.address, accountingStorage.address, {from: pitai});
        await accountingStorage.authorize(accountingProxy.address, {from: pitai});
        const accountingImpl = await deployer.deploy(AccountingImpl, {from: pitai});
        await accountingProxy.upgradeTo(accountingImpl.address, {from: pitai});
        const accounting = AccountingImpl.at(accountingProxy.address);
        // set accounting contract on rental
        await rental.setAccountingContract(accountingProxy.address, {from: pitai});
        await accounting.authorize(rentalProxy.address, {from: pitai});

        // Deploying auction contract
        const auctionProxy = await deployer.deploy(AuctionProxy, {from: pitai});
        const auctionImpl = await deployer.deploy(AuctionImpl, {from: pitai});
        await auctionProxy.upgradeTo(auctionImpl.address, {from: pitai});
        const auction = AuctionImpl.at(auctionProxy.address);

        // Deploying accessControl contract
        const accessControlStorage = await deployer.deploy(AccessControlStorage, {from: pitai});
        const auctionStorage = await deployer.deploy(AuctionStorage, {from: pitai});
        const accessControlProxy = await deployer.deploy(AccessControlProxy, dateTime.address, leptonStorage.address, accessControlStorage.address, auctionStorage.address, {from: pitai});
        await accessControlStorage.authorize(accessControlProxy.address, {from: pitai});
        await auctionStorage.authorize(accessControlProxy.address, {from: pitai});
        const accessControlImpl = await deployer.deploy(AccessControlImpl, {from: pitai});
        await accessControlProxy.upgradeTo(accessControlImpl.address, {from: pitai});
        const accessControl = AccessControlImpl.at(accessControlProxy.address);
        await accessControl.authorize(rentalProxy.address);
        await rental.setAccessControlContract(accessControlProxy.address, {from: pitai});
        await accounting.authorize(accessControlProxy.address, {from: pitai});
        await accessControl.setAccountingContract(accountingProxy.address);
        await auction.authorize(accessControlProxy.address, {from: pitai});
        await accessControl.setAuctionContract(auctionProxy.address);

        // setting wallets on rental
        await rental.setEscrowWallet(escrowWallet, {from: pitai});
        await rental.setRevenueWallet(revenueWallet, {from: pitai});
        await rental.setTokenWallet(tokenWallet, {from: pitai});
        await rental.addMasterNode(pitai, {from: pitai});

        // for tests, pre-approving accounting contract to sell 1B DVZ from tokenWallet
        const saleAmount = 1 * billionDVZ * microDVZ;
        await token.approve(accountingProxy.address, saleAmount, {from: tokenWallet});
    });
};


