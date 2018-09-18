const DeviseToken = artifacts.require("./DeviseToken");
const DateTime = artifacts.require("./DateTime");
const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
const DeviseRentalBase = artifacts.require("./DeviseRentalProxy");
const DeviseRental_v1 = artifacts.require("./DeviseRentalImpl");
const assertRevert = require('./helpers/assertRevert');
const {transferTokens} = require('./test-utils');

let token;
let proxy;
let rental;
const pitai = web3.eth.accounts[0];
const tokenWallet = web3.eth.accounts[1];
const escrowWallet = web3.eth.accounts[2];

contract("Token Features Tests", () => {
    before(async () => {
        // test case 1: DeviseToken contract deployed
        const cap = 10 * 10 ** 9 * 10 ** 6;
        token = await DeviseToken.new(cap, {from: pitai});

        const dateTime = await DateTime.deployed();
        const estor = await DeviseEternalStorage.new();
        // Create new upgradeable contract frontend (proxy)
        proxy = await DeviseRentalBase.new(token.address, dateTime.address, estor.address, 0, {from: pitai});
        // Set it's implementation version
        await proxy.upgradeTo((await DeviseRental_v1.new()).address);
        rental = DeviseRental_v1.at(proxy.address);

        assert.notEqual(token.address, 0x0, "DeviseToken contract address should not be NULL.");
        assert.notEqual(token.address, 0x0, "DeviseToken contract address should not be NULL.");
        // mint 1 billion tokens for token sale
        const saleAmount = 1 * 10 ** 9 * 10 ** 6;
        await token.mint(tokenWallet, saleAmount);
    });

    describe("Test the burnable feature", () => {
        it("Can burn tokens", async () => {
            await transferTokens(token, rental, tokenWallet, pitai, 5);
            const bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.isAbove(bal, 0);
            await token.burn(10000, {from: pitai});
            const new_bal = (await token.balanceOf.call(pitai)).toNumber();
            assert.equal(new_bal + 10000, bal);
        });

        it("Cannot burn more tokens than you have", async () => {
            await transferTokens(token, rental, tokenWallet, escrowWallet, .000005);
            const bal = (await token.balanceOf.call(escrowWallet)).toNumber();
            assert.isAbove(bal, 0);
            await assertRevert(token.burn(100000, {from: escrowWallet}));
        });
    });
});

contract("CappedTokenTest", () => {
    before(async () => {
        // total cap is 1 billion and the decimal is 18
        const cap = 10 ** 9 * 10 ** 18;
        token = await DeviseToken.new(cap, {from: pitai});
    });

    describe("Can mint", () => {
        it("Inheritance order: CappedToken, RBACMintableToken", async () => {
            await token.mint(pitai, 1000, {from: pitai});
            const bal = (await token.balanceOf(pitai)).toNumber();
            assert.equal(bal, 1000);
        });
    });

    describe("Cannot mint more tokens than the cap", () => {
        it("Inheritance order: CappedToken, RBACMintableToken", async () => {
            const lotsOfTokens = 2 * 10 ** 9 * 10 ** 18;
            const cap = (await token.cap.call()).toNumber();
            assert.isAbove(lotsOfTokens, cap);
            await assertRevert(token.mint(pitai, lotsOfTokens, {from: pitai}));
        });
    });
});

async function getMinters(_token, _numberOfMinters, _owner) {
    let minters = [];
    for (let i = 0; i < _numberOfMinters; i++) {
        const addr = await _token.getMinter.call(i, {from: _owner});
        minters.push(addr);
    }
    return minters;
}

contract("Test multiple minters", () => {
    beforeEach(async () => {
        // total cap is 1 billion and the decimal is 18
        const cap = 10 ** 9 * 10 ** 18;
        token = await DeviseToken.new(cap, {from: pitai});
    });

    it("Two minters can mint", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[6];
        let ret = await token.hasRole.call(minter1, "minter");
        assert.equal(ret, false);
        await token.addMinter(minter1, {from: pitai});
        await token.addMinter(minter2, {from: pitai});
        ret = await token.hasRole.call(minter2, "minter");
        assert.equal(ret, true);
        ret = await token.hasRole.call(pitai, "minter");
        assert.equal(ret, true);
        let bal = (await token.totalSupply.call()).toNumber();
        assert.equal(bal, 0);
        await token.mint(pitai, 1000, {from: pitai});
        bal = (await token.totalSupply.call()).toNumber();
        assert.equal(bal, 1000);
        await token.mint(minter2, 2000, {from: minter2});
        bal = (await token.totalSupply.call()).toNumber();
        assert.equal(bal, 3000);
        await token.mint(minter1, 3000, {from: minter1});
        bal = (await token.totalSupply.call()).toNumber();
        assert.equal(bal, 6000);
    });

    it("Can get number of minters", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[6];
        await token.addMinter(minter1, {from: pitai});
        await token.addMinter(minter2, {from: pitai});
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 2 + 1);
    });

    it("Should not count duplicate minters", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[5];
        await token.addMinter(minter1, {from: pitai});
        await token.addMinter(minter2, {from: pitai});
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 1 + 1);
    });

    it("Should decrease the number of minters when removed", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[6];
        await token.addMinter(minter1, {from: pitai});
        await token.addMinter(minter2, {from: pitai});
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 2 + 1);
        await token.removeMinter(minter1, {from: pitai});
        const n1 = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n1, 1 + 1);
    });

    it("Can only call getNumberOfMinters by owner", async () => {
        const client = web3.eth.accounts[5];
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 1);
        await assertRevert(token.getNumberOfMinters.call({from: client}));
    });

    it("Can get a list of minters", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[6];
        await token.addMinter(minter1, {from: pitai});
        await token.addMinter(minter2, {from: pitai});
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 2 + 1);
        const minters = await getMinters(token, n, pitai);
        assert.equal(minters.length, 3);
        assert.equal(minters[0], '0xd4a6b94e45b8c0185e33f210f4f96bdae40aa22e');
    });

    it("Can only call getMinter by owner", async () => {
        const client = web3.eth.accounts[5];
        await assertRevert(getMinters(token, 1, client));
    });

    it("Can remove a minter when there is only one minter", async () => {
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 1);
        await token.removeMinter(pitai, {from: pitai});
        const n1 = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n1, 0);
    });

    it("Should be a NO-OP when calling removeMinter when there is no minter existent", async () => {
        const n = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n, 1);
        await token.removeMinter(pitai, {from: pitai});
        const n1 = (await token.getNumberOfMinters.call({from: pitai})).toNumber();
        assert.equal(n1, 0);
        await token.removeMinter(pitai, {from: pitai});
    });
});
