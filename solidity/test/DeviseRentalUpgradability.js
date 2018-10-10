const DeviseRentalProxy = artifacts.require('DeviseRentalProxy');
const Rental_V0 = artifacts.require('./test/DeviseRentalImplTest');
const LeptonStorage = artifacts.require("./LeptonStorage");
const DeviseLeptonProxy = artifacts.require("./DeviseMiningProxy");
const DeviseLeptonImpl = artifacts.require("./DeviseMiningImpl");
const setupFixturesHelper = require('./helpers/setupFixtures');
const {transferTokens} = require('./test-utils');

const leptons = require('./leptons');

contract('DeviseRentalUpgradability', (accounts) => {
    let proxy;
    let impl_v0;
    let rental;
    let leptonProxy;
    let leptonImpl;
    const pitai = web3.eth.accounts[0];
    let proxyOwner = pitai;
    let tokenWallet = pitai;
    let escrowWallet = accounts[1];
    let revenueWallet = accounts[2];
    let auctionProxy;
    let accountingProxy;
    let accessControlProxy;
    let accessControl;
    let auction;
    let accounting;
    let token;
    let eternalStorage;
    let dateTime;

    beforeEach(async function () {
        ({
            token,
            dateTime,
            auctionProxy,
            auction,
            accountingProxy,
            accounting,
            accessControlProxy,
            accessControl,
            eternalStorage,
            dateTime
        } = await setupFixturesHelper(proxyOwner, escrowWallet, tokenWallet, revenueWallet, null, false, false));
        proxy = await DeviseRentalProxy.new(token.address, {from: proxyOwner});
        impl_v0 = await Rental_V0.new({from: proxyOwner});
        rental = Rental_V0.at(proxy.address);
        await auction.authorize(proxy.address);
        await accounting.authorize(proxy.address);
    });

    describe('Hard Fork', () => {
        it('new proxy doesn\'t lose totalIncrementalUsefulness on hard fork', async function () {
            await proxy.upgradeTo(impl_v0.address, {from: proxyOwner});
            const leptonStorage = await LeptonStorage.new();
            leptonProxy = await DeviseLeptonProxy.new(leptonStorage.address, {from: proxyOwner});
            await leptonProxy.upgradeTo((await DeviseLeptonImpl.new()).address);
            await rental.setLeptonProxy(leptonProxy.address, {from: proxyOwner});
            leptonImpl = DeviseLeptonImpl.at(leptonProxy.address);
            await leptonImpl.authorize(proxy.address, {from: proxyOwner});
            await leptonStorage.authorize(leptonProxy.address);
            await rental.setAccountingContract(accountingProxy.address, {from: proxyOwner});
            await rental.setAccessControlContract(accessControlProxy.address, {from: proxyOwner});
            await accessControl.authorize(proxy.address);
            await rental.addMasterNode(pitai, {from: proxyOwner});
            await rental.addLepton(leptons[0], '', 3, {from: pitai});
            await rental.addLepton(leptons[1], leptons[0], 2, {from: pitai});
            await rental.addLepton(leptons[2], leptons[1], 1, {from: pitai});
            const proxy2 = await DeviseRentalProxy.new(token.address, {from: proxyOwner});
            await auction.authorize(proxy2.address);
            await accounting.authorize(proxy2.address);
            assert(proxy.address !== proxy2.address);
            await proxy2.upgradeTo(impl_v0.address, {from: proxyOwner});
            const rental2 = Rental_V0.at(proxy2.address);
            rental2.setLeptonProxy(leptonProxy.address, {from: proxyOwner});
            await leptonImpl.authorize(proxy2.address, {from: proxyOwner});
            await rental2.setAccountingContract(accountingProxy.address, {from: proxyOwner});
            await rental2.setAccessControlContract(accessControlProxy.address, {from: proxyOwner});
            assert.equal((await rental.getTotalIncrementalUsefulness.call()).toNumber(), 6);
            assert.equal((await rental2.getTotalIncrementalUsefulness.call()).toNumber(), 6);
            assert.deepEqual(await rental2.getAllLeptons.call(), await rental.getAllLeptons.call());
        });
    });

    describe('owner', function () {
        it('has an owner', async function () {
            const owner = await proxy.owner();
            assert.equal(owner, proxyOwner);
        });
    });

    describe('version and implementation', function () {
        describe('when no initial version is provided', function () {
            it('non version and the zero address are returned', async function () {
                const version = (await proxy.version()).toNumber();
                const implementation = await proxy.implementation();
                let impl_history, ver_history;
                [impl_history, ver_history] = await proxy.getAllImplementations();

                assert.equal(version, 0x0);
                assert.equal(implementation, 0x0);
                assert.deepEqual(impl_history, []);
                assert.deepEqual(ver_history, []);
            });
        });

        describe('when an initial version is provided', function () {
            beforeEach(async () => await proxy.upgradeTo(impl_v0.address, {from: proxyOwner}));

            it('returns the new version and implementation', async function () {
                const version = (await proxy.version()).toNumber();
                const implementation = await proxy.implementation();
                let impl_history, ver_history;
                [impl_history, ver_history] = await proxy.getAllImplementations();

                assert.equal(version, 1);
                assert.equal(implementation, impl_v0.address);
                assert.deepEqual(impl_history, [impl_v0.address]);
                ver_history = ver_history.map(ver => ver.toNumber());
                assert.deepEqual(ver_history, [1]);
            });
            it("Should return version 2 when upgrade twice", async () => {
                const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                const impl_v3 = await DeviseRental_v3.new({from: accounts[0]});
                await proxy.upgradeTo(impl_v3.address, {from: accounts[0]});
                const testString1 = (await proxy.version.call({from: accounts[2]})).toNumber();
                let impl_history, ver_history;
                [impl_history, ver_history] = await proxy.getAllImplementations();
                assert.equal(testString1, 2);
                assert.deepEqual(impl_history, [impl_v0.address, impl_v3.address]);
                ver_history = ver_history.map(ver => ver.toNumber());
                assert.deepEqual(ver_history, [1, 2]);
            });
            it("Should return version 1 when revert back, but with all implementations stored", async () => {
                const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                const impl_v3 = await DeviseRental_v3.new({from: accounts[0]});
                await proxy.upgradeTo(impl_v3.address, {from: accounts[0]});
                await proxy.upgradeTo(impl_v0.address, {from: accounts[0]});
                const testString1 = (await proxy.version.call({from: accounts[2]})).toNumber();
                let impl_history, ver_history;
                [impl_history, ver_history] = await proxy.getAllImplementations();
                assert.equal(testString1, 1);
                assert.deepEqual(impl_history, [impl_v0.address, impl_v3.address, impl_v0.address]);
                ver_history = ver_history.map(ver => ver.toNumber());
                assert.deepEqual(ver_history, [1, 2, 1]);
            });
        });
    });

    describe('upgrade and call', function () {
        describe('when the new implementation is not zero address', function () {
            describe('when the sender is the proxy owner', function () {
                it('calls the implementation using the given data as msg.data', async function () {
                    await proxy.upgradeTo(impl_v0.address, {from: proxyOwner});
                    const leptonStorage = await LeptonStorage.new();
                    leptonProxy = await DeviseLeptonProxy.new(leptonStorage.address, {from: proxyOwner});
                    await leptonProxy.upgradeTo((await DeviseLeptonImpl.new()).address);
                    await rental.setLeptonProxy(leptonProxy.address, {from: proxyOwner});
                    leptonImpl = DeviseLeptonImpl.at(leptonProxy.address);
                    await leptonImpl.authorize(proxy.address, {from: proxyOwner});
                    await leptonStorage.authorize(leptonProxy.address);

                    const owner = await rental.owner.call();
                    assert.equal(owner, proxyOwner);

                    const client = accounts[2];
                    await transferTokens(token, rental, tokenWallet, client, 0.0005);
                    await token.approve(accountingProxy.address, 1000000, {from: client});
                    await accounting.authorize(proxy.address);
                    await accessControl.authorize(proxy.address);
                    await rental.setAccountingContract(accountingProxy.address, {from: proxyOwner});
                    await rental.setAccessControlContract(accessControlProxy.address, {from: proxyOwner});
                    const curWallet = await rental.escrowWallet.call();
                    await rental.setEscrowWallet(escrowWallet, {from: proxyOwner});
                    await rental.provision(1000000, {from: client});
                    const bal = await rental.getAllowance.call({from: client});
                    assert.equal(bal.toNumber(), 1000000);
                });

                // Skipped since we can't add methods without a Proxy fallback assemby
                it("Can read the original state variable when override the type of state variables with upgrades", async () => {
                    const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                    await proxy.upgradeTo((await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                    const testString1 = (await proxy.version.call({from: accounts[2]})).toNumber();
                    assert.equal(testString1, 1);
                });

                describe("Overriding state variables defined in proxy is OK", function () {
                    it("will not corrupt the original state variable in proxy when override the type of state variables with upgrades", async () => {
                        const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                        await proxy.upgradeTo((await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                        const rental_v3 = DeviseRental_v3.at(proxy.address);
                        await rental_v3.setVersion(3, {from: accounts[0]});
                        const testInt = (await rental_v3.getVersion.call()).toNumber();
                        assert.equal(testInt, 3);
                        const testString1 = (await proxy.version.call({from: accounts[2]})).toNumber();
                        assert.equal(testString1, 1);
                    });
                });

                it("Cannot override method modifier in upgrades", async () => {
                    const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                    await proxy.upgradeTo((await DeviseRental_v3.new({from: proxyOwner})).address, {from: proxyOwner});
                    const leptonStorage = await LeptonStorage.new();
                    leptonProxy = await DeviseLeptonProxy.new(leptonStorage.address, {from: proxyOwner});
                    await leptonProxy.upgradeTo((await DeviseLeptonImpl.new()).address);
                    const rental_v3 = DeviseRental_v3.at(proxy.address);
                    await rental_v3.setLeptonProxy(leptonProxy.address, {from: proxyOwner});
                    leptonImpl = DeviseLeptonImpl.at(leptonProxy.address);
                    await leptonImpl.authorize(proxy.address, {from: proxyOwner});
                    await leptonStorage.authorize(leptonProxy.address);

                    await rental_v3.setAccountingContract(accountingProxy.address, {from: proxyOwner});
                    await rental_v3.setAccessControlContract(accessControlProxy.address, {from: proxyOwner});
                    await accessControl.authorize(proxy.address);
                    await rental_v3.setEscrowWallet(escrowWallet, {from: proxyOwner});
                    // new method to set the master node for the new modifier
                    await rental_v3.setMasterNode(pitai);
                    // Call our custom addLepton method which uses a different modifier
                    await rental_v3.addLepton(leptons[0], '', 3, {from: pitai});
                    await rental_v3.addLepton(leptons[1], leptons[0], 2, {from: pitai});
                    await rental_v3.addLepton(leptons[2], leptons[1], 1, {from: pitai});
                    const tiu = (await rental_v3.getTotalIncrementalUsefulness.call({from: accounts[2]})).toNumber();
                    assert.equal(tiu, 6);
                });

                it("Retains the same information after upgrade", async () => {
                    const client = accounts[5];
                    await proxy.upgradeTo(impl_v0.address, {from: proxyOwner});
                    const leptonStorage = await LeptonStorage.new();
                    leptonProxy = await DeviseLeptonProxy.new(leptonStorage.address, {from: proxyOwner});
                    await leptonProxy.upgradeTo((await DeviseLeptonImpl.new()).address);
                    await rental.setLeptonProxy(leptonProxy.address, {from: proxyOwner});
                    leptonImpl = DeviseLeptonImpl.at(leptonProxy.address);
                    await leptonImpl.authorize(proxy.address, {from: proxyOwner});
                    await leptonStorage.authorize(leptonProxy.address);
                    await transferTokens(token, rental, tokenWallet, client, 0.0005);
                    await token.approve(accountingProxy.address, 1000000, {from: client});
                    await rental.setAccountingContract(accountingProxy.address, {from: proxyOwner});
                    await rental.setAccessControlContract(accessControlProxy.address, {from: proxyOwner});
                    await accessControl.authorize(proxy.address);

                    await rental.setEscrowWallet(escrowWallet, {from: proxyOwner});
                    await rental.provision(10000, {from: client});
                    await token.approve(accountingProxy.address, 10000, {from: escrowWallet});
                    await rental.withdraw(5000, {from: client});
                    const bal = await rental.getAllowance.call({from: client});
                    assert.equal(bal, 5000);

                    const DeviseRental_v2 = artifacts.require("./DeviseRentalImplV2");
                    await proxy.upgradeTo((await DeviseRental_v2.new({from: proxyOwner})).address, {from: proxyOwner});
                    const rental_v2 = DeviseRental_v2.at(proxy.address);
                    const bal2 = (await rental_v2.getAllowance.call({from: client})).toNumber();
                    assert.equal(bal2, 5000);
                    await rental_v2.withdraw(5000, {from: client});
                    const bal3 = (await rental_v2.getAllowance.call({from: client})).toNumber();
                    assert.equal(bal3, 0);
                });
            });
        });
    });
});
