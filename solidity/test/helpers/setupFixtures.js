const {timeTravel, assertContractState, transferTokens} = require('../test-utils');
const DateTime = artifacts.require("./DateTime");
const DeviseToken = artifacts.require("./DeviseToken");

const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
const DeviseRental_v1 = artifacts.require("./DeviseRentalImpl");
const LeptonStorage = artifacts.require("./LeptonStorage");
const DeviseMiningProxy = artifacts.require("./DeviseMiningProxy");
const DeviseMiningImpl = artifacts.require("./DeviseMiningImpl");

const AccessControlStorage = artifacts.require("./AccessControlStorage");
const AccessControlProxy = artifacts.require("./AccessControlProxy");
const AccessControlImpl = artifacts.require("./AccessControl");

const AccountingProxy = artifacts.require("./AccountingProxy");
const AccountingStorage = artifacts.require("./AccountingStorage");
const Accounting = artifacts.require("./Accounting");
const AuctionProxy = artifacts.require("./AuctionProxy");
const AuctionStorage = artifacts.require("./AuctionStorage");
const Auction = artifacts.require("./Auction");
const AuditProxy = artifacts.require("./AuditProxy");
const Audit = artifacts.require("./AuditImpl");
const assertRevert = require('./assertRevert');
const leptons = require('../leptons');

const setupFixtures = async function (pitai, escrowWallet, tokenWallet, revenueWallet, clients, initWallets, initLeptons) {
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;

    // Token Contract
    const cap = 10 * 10 ** 9 * 10 ** 6;
    const token = await DeviseToken.new(cap, {from: pitai});
    // mint 1 billion tokens for token sale
    const saleAmount = 1 * 10 ** 9 * 10 ** 6;
    await token.mint(tokenWallet, saleAmount);
    // DateTime Contract
    const dateTime = await DateTime.deployed();

    // Rental Proxy
    const rentalProxy = await DeviseRentalBase.new(token.address, {from: pitai});
    // Set it's implementation version
    await rentalProxy.upgradeTo((await DeviseRental_v1.new()).address);
    const rental = DeviseRental_v1.at(rentalProxy.address);
    rental._token = token;
    rental.assertContractState = assertContractState;

    // Lepton Proxy and Impl
    const leptonStorage = await LeptonStorage.new({from: pitai});
    const leptonProxy = await DeviseMiningProxy.new(leptonStorage.address, {from: pitai});
    await leptonProxy.upgradeTo((await DeviseMiningImpl.new()).address);
    await rental.setLeptonProxy(leptonProxy.address, {from: pitai});
    const leptonImpl = DeviseMiningImpl.at(leptonProxy.address);
    await leptonImpl.authorize(rentalProxy.address, {from: pitai});
    const lepton = DeviseMiningImpl.at(leptonProxy.address);

    // Deploying access control contract
    const auctionStorage = await AuctionStorage.new({from: pitai});
    const accessControlStorage = await AccessControlStorage.new({from: pitai});
    const accessControlProxy = await AccessControlProxy.new(dateTime.address, leptonStorage.address, accessControlStorage.address, auctionStorage.address, {from: pitai});
    await auctionStorage.authorize(accessControlProxy.address);
    await accessControlStorage.authorize(accessControlProxy.address, {from: pitai});
    const accessControlImpl = await AccessControlImpl.new({from: pitai});
    await accessControlProxy.upgradeTo(accessControlImpl.address, {from: pitai});
    const accessControl = AccessControlImpl.at(accessControlProxy.address);
    await accessControl.authorize(rentalProxy.address);

    // deploying accounting  contracts
    const accountingStorage = await AccountingStorage.new({from: pitai});
    const accountingProxy = await AccountingProxy.new(token.address, accountingStorage.address, {from: pitai});
    await accountingStorage.authorize(accountingProxy.address);
    await accountingProxy.upgradeTo((await Accounting.new()).address, {from: pitai});
    const accounting = Accounting.at(accountingProxy.address);

    // deploying auction proxy and impl contracts
    const auctionProxy = await AuctionProxy.new({from: pitai});
    await auctionProxy.upgradeTo((await Auction.new()).address, {from: pitai});
    const auction = Auction.at(auctionProxy.address);

    // deploying audit proxy and impl contracts
    const auditProxy = await AuditProxy.new({from: pitai});
    await auditProxy.upgradeTo((await Audit.new()).address, {from: pitai});
    const audit = Audit.at(auditProxy.address);

    // authorize the rental proxy to use our accounting and auction contracts
    await accounting.authorize(rentalProxy.address);
    await auction.authorize(accessControlProxy.address);
    await accounting.authorize(accessControlProxy.address);

    // set the new contracts on rental contract
    await rental.setAccountingContract(accountingProxy.address, {from: pitai});
    await rental.setAccessControlContract(accessControlProxy.address, {from: pitai});
    await accessControl.setAccountingContract(accountingProxy.address, {from: pitai});
    await accessControl.setAuctionContract(auctionProxy.address, {from: pitai});

    if (initWallets === true) {
        await rental.setEscrowWallet(escrowWallet, {from: pitai});
        await rental.setRevenueWallet(revenueWallet, {from: pitai});
        const escrow_cap = 1000000000000000000 * microDVZ;
        await token.approve(accountingProxy.address, escrow_cap, {from: escrowWallet});
    }

    if (clients) {
        // Some clients buy tokens and approve transfer to rental contract
        const ether_amount = 5000;
        await Promise.all(clients.slice(0, 11).map(async client => await transferTokens(token, rental, tokenWallet, client, ether_amount)));
        await Promise.all(clients.slice(0, 11).map(async client => await token.approve(accountingProxy.address, 100 * millionDVZ * microDVZ, {from: client})));
    }

    if (initLeptons === true) {
        // test addLepton can't be called prior to authorize
        await rental.addMasterNode(pitai);
        await assertRevert(rental.addLepton(leptons[0], '', 1000000 * (3)));
        await leptonStorage.authorize(leptonProxy.address);
        // Pit.AI adds leptons to rental contract
        await rental.addLepton(leptons[0], '', 1000000 * (3), {from: pitai});
        await rental.addLepton(leptons[1], leptons[0], 1000000 * (3), {from: pitai});
        await rental.addLepton(leptons[2], leptons[1], 1000000 * (2), {from: pitai});
        await rental.addLepton(leptons[3], leptons[2], 1000000 * (2), {from: pitai});
        await rental.addLepton(leptons[4], leptons[3], 1000000 * (1), {from: pitai});
        await rental.addLepton(leptons[5], leptons[4], 1000000 * (1), {from: pitai});
        // move forward 1 month
        await timeTravel(86400 * 31);
    } else {
        await leptonStorage.authorize(leptonProxy.address);
    }

    return {
        dateTime,
        rental,
        token,
        proxy: rentalProxy,
        escrowWallet,
        revenueWallet,
        tokenWallet,
        auctionProxy,
        auctionStorage,
        auction,
        accountingProxy,
        accountingStorage,
        accounting,
        leptonProxy,
        lepton,
        accessControl,
        accessControlProxy,
        auditProxy,
        audit
    };
};

module.exports = setupFixtures;