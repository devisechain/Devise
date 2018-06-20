const MintableTokenTest = artifacts.require("./test/MintableTokenTest");
const MintableTokenTest1 = artifacts.require("./test/MintableTokenTest1");
const MintableTokenTestBoth = artifacts.require("./test/MintableTokenTestBoth");
const MintableTokenTestBoth1 = artifacts.require("./test/MintableTokenTestBoth1");
const assertRevert = require('./helpers/assertRevert');

let token;
let token1;
let tokenBoth;
let tokenBoth1;
let pitai = web3.eth.accounts[0];

contract("MintableTokenTest", () => {
    before(async () => {
        token = await MintableTokenTest.deployed();
        token1 = await MintableTokenTest1.deployed();
    });

    describe("Can mint", () => {
        it("Inheritance order: CappedToken, RBACMintableToken", async () => {
            await token.mint(pitai, 1000, {from: pitai});
            const bal = (await token.balanceOf(pitai)).toNumber();
            assert.equal(bal, 1000);
        });

        it("Inheritance order: RBACMintableToken, CappedToken", async () => {
            await token1.mint(pitai, 1000, {from: pitai});
            const bal = (await token1.balanceOf(pitai)).toNumber();
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

        it("Inheritance order: RBACMintableToken, CappedToken", async () => {
            const lotsOfTokens = 2 * 10 ** 9 * 10 ** 18;
            const cap = (await token1.cap.call()).toNumber();
            assert.isAbove(lotsOfTokens, cap);
            await assertRevert(token1.mint(pitai, lotsOfTokens, {from: pitai}));
        });
    });
});

contract("MintableTokenTestBoth", () => {
    before(async () => {
        tokenBoth = await MintableTokenTestBoth.deployed();
        tokenBoth1 = await MintableTokenTestBoth1.deployed();
    });

    describe("Can mint", () => {
        it("Inheritance order: CappedToken, RBACMintableToken", async () => {
            await tokenBoth.mint(pitai, 1000, {from: pitai});
            const bal = (await tokenBoth.balanceOf(pitai)).toNumber();
            assert.equal(bal, 1000);
        });

        it("Inheritance order: RBACMintableToken, CappedToken", async () => {
            await tokenBoth1.mint(pitai, 1000, {from: pitai});
            const bal = (await tokenBoth1.balanceOf(pitai)).toNumber();
            assert.equal(bal, 1000);
        });
    });

    describe("Cannot mint more tokens than the cap", () => {
        it("Inheritance order: CappedToken, RBACMintableToken, it works because super is used", async () => {
            const lotsOfTokens = 2 * 10 ** 9 * 10 ** 18;
            const cap = (await tokenBoth.cap.call()).toNumber();
            assert.isAbove(lotsOfTokens, cap);
            await assertRevert(tokenBoth.mint(pitai, lotsOfTokens, {from: pitai}));
        });

        it("Inheritance order: RBACMintableToken, CappedToken", async () => {
            const lotsOfTokens = 2 * 10 ** 9 * 10 ** 18;
            const cap = (await tokenBoth1.cap.call()).toNumber();
            assert.isAbove(lotsOfTokens, cap);
            await assertRevert(tokenBoth1.mint(pitai, lotsOfTokens, {from: pitai}));
        });
    });
});

contract("Test multiple minters", () => {
    before(async () => {
        token = await MintableTokenTest.deployed();
        token1 = await MintableTokenTest1.deployed();
    });

    it("Add two minters", async () => {
        const minter1 = web3.eth.accounts[5];
        const minter2 = web3.eth.accounts[6];
        let ret = await token1.hasRole.call(minter1, "minter");
        assert.equal(ret, false);
        await token1.addMinter(minter1, {from: pitai});
        await token1.addMinter(minter2, {from: pitai});
        ret = await token1.hasRole.call(minter2, "minter");
        assert.equal(ret, true);
        ret = await token1.hasRole.call(pitai, "minter");
        assert.equal(ret, true);
        let bal = (await token1.totalSupply.call()).toNumber();
        assert.equal(bal, 0);
        await token1.mint(pitai, 1000, {from: pitai});
        bal = (await token1.totalSupply.call()).toNumber();
        assert.equal(bal, 1000);
        await token1.mint(minter2, 2000, {from: minter2});
        bal = (await token1.totalSupply.call()).toNumber();
        assert.equal(bal, 3000);
        await token1.mint(minter1, 3000, {from: minter1});
        bal = (await token1.totalSupply.call()).toNumber();
        assert.equal(bal, 6000);
    });
});