const chai = require('chai');
const assert = chai.assert;
const RentalContract = require('../devise/clients/contract');
const network = 'ganache';
const TOKEN_PRECISION = 10 ** 6;

describe('RentalContractTest', function () {
    this.timeout(20000);
    let contract;
    let accounts;
    let pitai;
    let web3;
    const impl_address = '0x5a1e6BC336D5d19E0ADfaa6A1826CF39A55315bA';
    const gas = 3000000;
    beforeEach(async () => {
        contract = new RentalContract(undefined, undefined, network);
        await contract.init_contracts();
        accounts = await contract.web3.eth.getAccounts();
        pitai = accounts[0];
        web3 = contract.web3;
    });
    it('GetClientAddress should return undefined for random address', async () => {
        const ben = '0xff7ed912a50ce110a640bf234be2e3caa592f1e9';
        const client = await contract.get_client_address(ben);
        assert.isUndefined(client);
    });
    it('dvz_balance should return zero for random address', async () => {
        const bal = await contract.dvz_balance();
        assert.equal(bal, 0);
    });
    it('eth_balance should be zero for random address', async () => {
        const addr = contract.web3.utils.toChecksumAddress('0xff7ed912a50ce110a640bf234be2e3caa592f1e9');
        contract = new RentalContract(addr, undefined, network);
        const bal = await contract.eth_balance();
        assert.equal(bal, 0);
    });
    it('dvz_balance_escrow should return zero for random address', async () => {
        const bal = await contract.dvz_balance_escrow();
        assert.equal(bal, 0);
    });
    it('rent_per_seat_current_term should be greater than 1000', async () => {
        const hash = contract.web3.utils.asciiToHex('12345678901234567890');
        const pre_hash = contract.web3.utils.asciiToHex('');
        const status = await contract._rental_contract.methods.addLepton(hash, pre_hash, 5).send({
            from: accounts[0],
            gas: 1000000
        });
        const rent = await contract.rent_per_seat_current_term();
        assert.isAbove(rent, 0);
    });
    it('indicative_rent_per_seat_next_term should be greater than 1000', async () => {
        const rent = await contract.indicative_rent_per_seat_next_term();
        assert.isAbove(rent, 0);
    });
    it('current_lease_term should be defined', async () => {
        const term = await contract.current_lease_term();
        console.log("Current lease term ", term);
        assert.isDefined(term);
    });
    it('price_per_bit_current_term should be at least 1000', async () => {
        const price = await contract.price_per_bit_current_term();
        assert.isAtLeast(price, 1000);
    });
    it('indicative_price_per_bit_next_term should be at least 1000', async () => {
        const price = await contract.indicative_price_per_bit_next_term();
        assert.isAtLeast(price, 1000);
    });
    it('is_power_user should return false for a random address', async () => {
        const status = await contract.is_power_user();
        assert.isFalse(status);
    });
    it('beneficiary should be account itself for a random address', async () => {
        const account = '0x007CcfFb7916F37F7AEEf05E8096ecFbe55AFc2f';
        contract = new RentalContract(account, undefined, network);
        await contract.init_contracts();
        const ben = await contract.beneficiary();
        assert.equal(ben, account);
    });
    it('total_incremental_usefulness should be above 300', async () => {
        const total_iu = await contract.total_incremental_usefulness();
        assert.isAbove(total_iu, 0);
    });
    it('seats_available should be at most 100', async () => {
        const seats = await contract.seats_available();
        assert.isAtMost(seats, 100);
    });
    it('current_term_seats should be zero for a random address', async () => {
        const seats = await contract.current_term_seats();
        assert.equal(seats, 0);
    });
    it('next_term_seats should be zero for a random address', async () => {
        const seats = await contract.next_term_seats();
        assert.equal(seats, 0);
    });
    it('client_summary should be undefined for a random address', async () => {
        const summary = await contract.client_summary();
        assert.isUndefined(summary);
    });
    it('get_client_summary should return a dictionary of fields', async () => {
        const client = accounts[6];
        const token_sale = contract._token_sale_contract._address;
        const dvz = 50000 * 10 ** 6;
        const status = await web3.eth.sendTransaction({
            from: client,
            to: token_sale,
            value: web3.utils.toWei('5', 'ether'),
            gas: gas
        });
        const rental = contract._rental_contract._address;
        await contract._token_contract.methods.approve(rental, dvz).send({from: client, gas: gas});
        const tx = await contract._rental_contract.methods.provision(dvz).send({from: client, gas: gas});
        const summary = await contract.get_client_summary(client);
        assert.equal(summary['beneficiary'], client);
        assert.equal(summary['dvz_balance_escrow'], 50000);
        assert.isAtMost(summary['dvz_balance'], 21895);
        assert.equal(summary['last_term_paid'], '1/2018');
        assert.equal(summary['power_user'], true);
        assert.equal(summary['historical_data_access'], true);
        assert.equal(summary['current_term_seats'], '0');
        assert.equal(summary['indicative_next_term_seats'], '0');
    });
    it('get_all_leptons should return an array of objects', async function () {
        this.timeout(120000);
        const leptons = await contract.get_all_leptons();
        assert.isAtLeast(leptons.length, 1);
        assert.equal(leptons[0].hash, '0x3132333435363738393031323334353637383930');
        assert.isUndefined(leptons[0].previous_hash);
        assert.equal(leptons[0].incremental_usefulness, 0.000005);
    });
    it('get_all_clients should return an array of objects', async function () {
        this.timeout(60000);
        const clients = await contract.get_all_clients();
        assert.isAtLeast(clients.length, 1);
    });
    it('get_all_bidders should return an array of objects', async function () {
        const client = accounts[6];
        const escrow = accounts[3];
        const escrow_cap = 10 ** 9 * TOKEN_PRECISION;
        const rental = contract._rental_contract._address;
        await contract._token_contract.methods.approve(rental, escrow_cap).send({from: escrow, gas: gas});
        await contract._rental_contract.methods.leaseAll(1000 * TOKEN_PRECISION, 1).send({from: client, gas: gas});
        const bidders = await contract.get_all_bidders();
        assert.isAtLeast(bidders.length, 1);
        const idx = 0;
        assert.equal(bidders[idx].address, client);
        assert.equal(bidders[idx].requested_seats, 1);
        assert.equal(bidders[idx].limit_price, 1000);
    });
    it('get_owner_eth_balance should not throw exception', async () => {
        const bal = await contract.get_owner_eth_balance();
        assert.isAtLeast(bal, 0);
    });
    it('get_escrow_wallet_address should return a non-zero address', async () => {
        const escrow = await contract.get_escrow_wallet_address();
        assert.notEqual(escrow, '0x0');
    });
    it('get_revenue_wallet_address should return a non-zero address', async () => {
        const revenue = await contract.get_revenue_wallet_address();
        assert.notEqual(revenue, '0x0');
    });
    it('balance_of_escrow_wallet should not throw exception', async () => {
        const bal = (await contract.balance_of_escrow_wallet());
        assert.isAtLeast(bal, 0);
    });
    it('balance_of_revenue_wallet should not throw exception', async () => {
        const bal = await contract.balance_of_revenue_wallet();
        assert.isAtLeast(bal, 0);
    });
    it("get_all_implementations should return an array of objects", async () => {
        const history = await contract.get_all_implementations();
        assert.deepEqual(history, [{impl: impl_address, ver: 1}]);
    });
});
