const DeviseRentalProxy = artifacts.require('DeviseRentalProxy');
const Rental_V0 = artifacts.require('./test/DeviseRentalImplTest');
const DeviseToken = artifacts.require("./DeviseToken");
const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DateTime = artifacts.require("./DateTime");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");

contract('DeviseRentalUpgradability', (accounts) => {
    let proxy;
    let impl_v0;
    let rental_v0;
    let proxyOwner;
    let pitaiWallet;
    let tokensale;
    let token;

    beforeEach(async function () {
        try {
            proxyOwner = accounts[0];
            pitaiWallet = accounts[1];
            const cap = 10 ** 9 * 10 ** 18;
            token = await DeviseToken.new(cap, {from: proxyOwner});
            const initialRate = new web3.BigNumber(16000);
            const finalRate = new web3.BigNumber(8000);
            const blockNumber = web3.eth.blockNumber;
            const openingTime = web3.eth.getBlock(blockNumber).timestamp;
            const closingTime = openingTime + 360 * 24 * 60 * 60;
            tokensale = await DeviseTokenSale.new(proxyOwner, initialRate, finalRate, openingTime, closingTime, token.address, {from: proxyOwner});
            const tokenWallet = await tokensale.tokenWallet.call();
            // mint 1 billion tokens for token sale
            const saleAmount = 1 * 10 ** 9 * 10 ** 6;
            await token.mint(tokenWallet, saleAmount);
            await token.approve(tokensale.address, saleAmount, {from: tokenWallet});
            const dateutils = await DateTime.new({from: proxyOwner});
            const estor = await DeviseEternalStorage.new();
            proxy = await DeviseRentalProxy.new(token.address, dateutils.address, estor.address, {from: proxyOwner});
            await tokensale.setRentalProxy(proxy.address);
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

    describe('owner', function () {
        it('has an owner', async function () {
            const owner = await proxy.owner();
            assert.equal(owner, proxyOwner);
        });
    });

    describe('version and implementation', function () {
        describe('when no initial version is provided', function () {
            it('non version and the zero address are returned', async function () {
                const version = await proxy.version();
                const implementation = await proxy.implementation();

                assert.equal(version, '');
                assert.equal(implementation, 0x0);
            });
        });

        describe('when an initial version is provided', function () {
            beforeEach(async () => await proxy.upgradeTo('version_0', impl_v0.address, {from: proxyOwner}));

            it('returns the new version and implementation', async function () {
                const version = await proxy.version();
                const implementation = await proxy.implementation();

                assert.equal(version, 'version_0');
                assert.equal(implementation, impl_v0.address);
            });
        });
    });

    describe('upgrade and call', function () {
        describe('when the new implementation is not zero address', function () {
            describe('when the sender is the proxy owner', function () {
                it('calls the implementation using the given data as msg.data', async function () {
                    await proxy.upgradeTo('0', impl_v0.address, {from: proxyOwner});

                    const owner = await rental_v0.owner.call();
                    assert.equal(owner, proxyOwner);

                    const client = accounts[2];
                    await tokensale.sendTransaction({from: client, value: web3.toWei(5, "ether"), gas: 1000000});
                    await token.approve(rental_v0.address, 1000000, {from: client});
                    await rental_v0.setEscrowWallet(pitaiWallet, {from: proxyOwner});
                    await rental_v0.provision(1000000, {from: client});
                    const bal = await rental_v0.getAllowance.call({from: client});
                    assert.equal(bal.toNumber(), 1000000);
                });

                // Skipped since we can't add methods without a Proxy fallback assemby
                it("Can read the original state variable when override the type of state variables with upgrades", async () => {
                    const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                    await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                    const testString1 = await proxy.version.call({from: accounts[2]});
                    assert.equal(testString1, "2.0");
                });

                describe("Overriding state variables defined in proxy is OK", function () {
                    it("will not corrupt the original state variable in proxy when override the type of state variables with upgrades", async () => {
                        const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                        await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                        const rental_v3 = DeviseRental_v3.at(proxy.address);
                        await rental_v3.setVersion(3, {from: accounts[0]});
                        const testInt = (await rental_v3.getVersion.call()).toNumber();
                        assert.equal(testInt, 3);
                        const testString1 = await proxy.version.call({from: accounts[2]});
                        assert.equal(testString1, "2.0");
                    });
                });

                it("Cannot override state variables with new same type variable in upgrades", async () => {
                    const DeviseRental_v3 = artifacts.require("./test/DeviseRentalImplV3");
                    await proxy.upgradeTo('2.0', (await DeviseRental_v3.new({from: accounts[0]})).address, {from: accounts[0]});
                    const rental_v3 = DeviseRental_v3.at(proxy.address);
                    const seats = (await rental_v3.getSeatsAvailable.call({from: accounts[2]})).toNumber();
                    assert.equal(seats, 100);
                    const seats2 = (await rental_v3.getSeatsAvailable.call({from: accounts[2]})).toNumber();
                    assert.equal(seats2, 100);
                });

                it("Retains the same information after upgrade", async () => {
                    const client = accounts[2];
                    await proxy.upgradeTo('0', impl_v0.address, {from: proxyOwner});
                    await tokensale.sendTransaction({from: client, value: web3.toWei(5, "ether"), gas: 1000000});
                    await token.approve(rental_v0.address, 1000000, {from: client});
                    await rental_v0.setEscrowWallet(pitaiWallet, {from: proxyOwner});
                    await rental_v0.provision(10000, {from: client});
                    await rental_v0.withdraw(5000, {from: client});
                    const bal = await rental_v0.getAllowance.call({from: client});
                    assert.equal(bal, 5000);

                    const DeviseRental_v2 = artifacts.require("./DeviseRentalImplV2");
                    await proxy.upgradeTo('2.0', (await DeviseRental_v2.new({from: proxyOwner})).address, {from: proxyOwner});
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
