const chai = require('chai');
const assert = chai.assert;
const RentalOwner = require('../devise/owner/owner');
const network = 'ganache';
const TOKEN_PRECISION = 10 ** 6;

describe('RentalOwnerTest', function () {
    this.timeout(20000);
    let rental_owner;
    let accounts;
    let pitai;
    let web3;
    const impl_address = '0x5a1e6BC336D5d19E0ADfaa6A1826CF39A55315bA';
    const gas = 3000000;
    beforeEach(async () => {
        rental_owner = new RentalOwner(undefined, undefined, network);
        await rental_owner.init_contracts();
        accounts = await rental_owner.web3.eth.getAccounts();
        pitai = accounts[0];
        web3 = rental_owner.web3;
    });
    it("get_implementation should return an address", async function () {
        const impl = await rental_owner.get_implementation();
        assert.equal(impl, impl_address);
    });
    it("get_version should return a positive number", async function () {
        const ver = await rental_owner.get_version();
        assert.equal(ver, 1);
    });
    it('get_escrow_history should return an array', async () => {
        const escrow_hist = await rental_owner.get_escrow_history();
        assert.deepEqual(escrow_hist, ['0x93c86A7574a1E5eAF773B807fFF3496728f5B1BC']);
    });
    it('get_escrow_version should return a positive number', async () => {
        const escrow_ver = await rental_owner.get_escrow_version();
        assert.equal(escrow_ver, 1);
    });
    it('get_revenue_history should return an array', async () => {
        const rev_hist = await rental_owner.get_revenue_history();
        assert.deepEqual(rev_hist, ['0x5c7Fe1B9bad324c5c8B90f66243B45F65B3f5fcd']);
    });
    it('get_revenue_version should return a positive number', async () => {
        const rev_ver = await rental_owner.get_revenue_version();
        assert.equal(rev_ver, 1);
    });
});
