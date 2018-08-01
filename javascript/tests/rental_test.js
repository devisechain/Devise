const chai = require('chai');
const assert = chai.assert;
const RentalContract = require('../devise/clients/contract');

describe('RentalContractTest', function () {
    this.timeout(20000);
    let contract;
    beforeEach(async () => {
        contract = new RentalContract(undefined, undefined, 'DEV1');
        await contract.init_contracts();
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
        const bal = await contract.eth_balance();
        assert.equal(bal, 1e-18);
    });
    it('dvz_balance_escrow should return zero for random address', async () => {
        const bal = await contract.dvz_balance_escrow();
        assert.equal(bal, 0);
    });
    it('rent_per_seat_current_term should be greater than 1000', async () => {
        const rent = await contract.rent_per_seat_current_term();
        assert.isAbove(rent, 1000);
    });
    it('indicative_rent_per_seat_next_term should be greater than 1000', async () => {
        const rent = await contract.indicative_rent_per_seat_next_term();
        assert.isAbove(rent, 1000);
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
        contract = new RentalContract(account, undefined, 'DEV1');
        await contract.init_contracts();
        const ben = await contract.beneficiary();
        assert.equal(ben, account);
    });
    it('total_incremental_usefulness should be above 300', async () => {
        const totalIU = await contract.total_incremental_usefulness();
        assert.isAbove(totalIU, 300);
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
    it('GetClientSummary should return a dictionary of fields', async () => {
        const client = "0xBC746f899B9DC86D3F8253167f9Ce01d8b8Ac47C";
        const summary = await contract.get_client_summary(client);
        assert.equal(summary['beneficiary'], '0x08Ee1B96d4e4Fc1c8Ce0a9C77248E456ee421cb5');
        assert.equal(summary['dvz_balance_escrow'], '0');
        assert.equal(summary['dvz_balance'], '0');
        assert.equal(summary['last_term_paid'], '8/2018');
        assert.equal(summary['power_user'], false);
        assert.equal(summary['historical_data_access'], false);
        assert.equal(summary['current_term_seats'], '1');
        assert.equal(summary['indicative_next_term_seats'], '0');
    });
    it('GetAllLeptons should return an array of objects', async function () {
        this.timeout(120000);
        const leptons = await contract.get_all_leptons();
        assert.isAtLeast(leptons.length, 303);
        assert.equal(leptons[0].hash, '0x392d88d028429d0177d102d9ebd5ff644351c30e');
        assert.isUndefined(leptons[0].previousHash);
        assert.equal(leptons[0].incrementalUsefulness, 5.035122);
    });
    it('GetAllClients should return an array of objects', async function () {
        this.timeout(60000);
        const clients = await contract.get_all_clients();
        assert.isAtLeast(clients.length, 24);
    });
    it('GetAllBidders should return an array of objects', async function () {
        const bidders = await contract.get_all_bidders();
        assert.isAtLeast(bidders.length, 5);
    });
});
