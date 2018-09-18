const DeviseRentalProxy = artifacts.require('DeviseRentalProxy');
const Rental_V0 = artifacts.require('./test/DeviseRentalImplTest');
const DeviseToken = artifacts.require("./DeviseToken");
const DateTime = artifacts.require("./DateTime");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const {transferTokens} = require('./test-utils');

const leptons = require('./leptons');

contract('DeviseRentalUpgradability', (accounts) => {
    let proxy;
    let impl_v0;
    let rental_v0;
    let proxyOwner;
    let tokenWallet;
    let pitaiWallet;
    let token;
    let estor;
    let dateutils;
    const pitai = web3.eth.accounts[0];

    beforeEach(async function () {
        try {
            proxyOwner = accounts[0];
            pitaiWallet = accounts[1];
            const cap = 10 ** 9 * 10 ** 18;
            token = await DeviseToken.new(cap, {from: proxyOwner});
            tokenWallet = proxyOwner;
            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount);
            dateutils = await DateTime.new({from: proxyOwner});
            estor = await DeviseEternalStorage.new();
            proxy = await DeviseRentalProxy.new(token.address, dateutils.address, estor.address, 0, {from: proxyOwner});
            await token.approve(proxy.address, 1000000000000000000000000, {from: pitaiWallet});
            impl_v0 = await Rental_V0.new({from: proxyOwner});
            console.log("logic contract implementation address ", impl_v0.address);
            rental_v0 = Rental_V0.at(proxy.address);
            console.log("proxy contract address ", rental_v0.address);
        } catch (e) {
            console.error(e);
            expect.fail();
        }
    });

    describe('Hard Fork', () => {
        it('new proxy totalIncrementalUsefulness arg sets total incremental usefulness', async function () {
            await estor.authorize(proxy.address);
            await proxy.upgradeTo(impl_v0.address, {from: proxyOwner});
            await rental_v0.addMasterNode(pitai);
            await rental_v0.addLepton(leptons[0], '', 3);
            await rental_v0.addLepton(leptons[1], leptons[0], 2);
            await rental_v0.addLepton(leptons[2], leptons[1], 1);
            const proxy2 = await DeviseRentalProxy.new(token.address, dateutils.address, estor.address, 6, {from: proxyOwner});
            await estor.authorize(proxy2.address);
            assert(proxy.address !== proxy2.address);
            await proxy2.upgradeTo(impl_v0.address, {from: proxyOwner});
            const rental2 = Rental_V0.at(proxy2.address);
            assert.equal((await rental_v0.getTotalIncrementalUsefulness()).toNumber(), 6);
            assert.equal((await rental2.getTotalIncrementalUsefulness()).toNumber(), 6);
            assert.deepEqual(await rental2.getAllLeptons.call(), await rental_v0.getAllLeptons.call());
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

                    const owner = await rental_v0.owner.call();
                    assert.equal(owner, proxyOwner);

                    const client = accounts[2];
                    await transferTokens(token, rental_v0, tokenWallet, client, 0.0005);
                    await token.approve(rental_v0.address, 1000000, {from: client});
                    await rental_v0.setEscrowWallet(pitaiWallet, {from: proxyOwner});
                    await rental_v0.provision(1000000, {from: client});
                    const bal = await rental_v0.getAllowance.call({from: client});
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

                it("Cannot override state variables with new same type variable in upgrades", async () => {
                    const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                    await proxy.upgradeTo((await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                    const rental_v3 = DeviseRental_v3.at(proxy.address);
                    const seats = (await rental_v3.getSeatsAvailable.call({from: accounts[2]})).toNumber();
                    assert.equal(seats, 100);
                    const seats2 = (await rental_v3.getSeatsAvailable.call({from: accounts[2]})).toNumber();
                    assert.equal(seats2, 100);
                });

                it("Retains the same information after upgrade", async () => {
                    const client = accounts[2];
                    await proxy.upgradeTo(impl_v0.address, {from: proxyOwner});
                    await transferTokens(token, rental_v0, tokenWallet, client, 0.0005);
                    await token.approve(rental_v0.address, 1000000, {from: client});
                    await rental_v0.setEscrowWallet(pitaiWallet, {from: proxyOwner});
                    await rental_v0.provision(10000, {from: client});
                    await rental_v0.withdraw(5000, {from: client});
                    const bal = await rental_v0.getAllowance.call({from: client});
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
