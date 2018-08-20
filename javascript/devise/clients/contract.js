/*!
 * RentalContract class
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GPLv3
 */
const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const IU_PRECISION = 10 ** 6;
const TOKEN_PRECISION = 10 ** 6;
const ETHER_PRECISION = 10 ** 18;

/*
 * RentalContract
 * This is the basic wrapper class around the Devise rental smart contract client facing operations.
 * This wrapper connects to an Ethereum node and facilitates rental smart contract operations such as provision,
 * leaseAll, getClientSummary, etc.
 */
class RentalContract extends BaseDeviseClient {
    /**
     * Constructor
     * @param account default: none, optional address to query the smart contract as
     * @param node_url default: auto, optional Ethereum node from which to query smart contract information
     * @param network default: MainNet, optional network to connect to
     */
    constructor(account, node_url, network) {
        super(account, node_url, network);
    }

    /**
     * Verifies that the client's escrow balance on the rental smart contract is sufficient to cover the number of seats
     * and limit price specified at the current total incremental usefulness
     * @param client_address The address for which to get the current escrow balance
     * @param num_seats The number of seats to use for the comparison
     * @param limit_price The limit price to use for the comparison
     * @returns {Promise<boolean>}
     * @private
     */
    async _has_sufficient_funds(client_address, num_seats, limit_price) {
        const current_balance = await this._rental_contract.methods.getAllowance().call({from: client_address}) / TOKEN_PRECISION;
        return limit_price * this.total_incremental_usefulness() * num_seats <= current_balance;
    }

    /**
     * Finds the client address for a beneficiary if the address provided is a beneficiary
     * @param address a beneficiary address
     * @returns {Promise<string>} The client address if any
     */
    async get_client_address(address) {
        const client_address = await this._rental_contract.methods.getClientForBeneficiary().call({from: address});
        if (client_address !== '0x0000000000000000000000000000000000000000')
            return client_address;
    }

    /**
     * Queries the DeviseToken contract for the token balance of the current account
     * @returns {Promise<number>}
     */
    async dvz_balance() {
        return await this._token_contract.methods.balanceOf(this.address).call({from: this.address}) / TOKEN_PRECISION;
    }

    /**
     * Queries and returns the Ether balance of the given address
     * @returns {Promise<number>}
     */
    async eth_balance() {
        if (this.address === undefined)
            return 0;
        return await this.web3.eth.getBalance(this.address) / ETHER_PRECISION;
    }

    /**
     * Queries the Devise rental contract for the number of tokens provisioned into the rental contract for this account
     * @returns {Promise<number>}
     */
    async dvz_balance_escrow() {
        return await this._rental_contract.methods.getAllowance().call({from: this.address}) / TOKEN_PRECISION;
    }

    /**
     * Queries the Devise rental contract for the rent per seat for the current lease term
     * @returns {Promise<number>}
     */
    async rent_per_seat_current_term() {
        return await this._rental_contract.methods.getRentPerSeatCurrentTerm().call() / TOKEN_PRECISION;
    }

    /**
     * Queries the Devise rental contract for the indicative rent per seat for the next lease term
     * @returns {Promise<number>}
     */
    async indicative_rent_per_seat_next_term() {
        return await this._rental_contract.methods.getIndicativeRentPerSeatNextTerm().call() / TOKEN_PRECISION;
    }

    /**
     * Returns the current lease term per the smart contract as a string (for example 8/2018)
     * @returns {Promise<string>}
     */
    async current_lease_term() {
        const idx = await this._rental_contract.methods.getCurrentLeaseTerm().call();
        return this._lease_term_to_date_str(idx);
    }

    /**
     * Converts numerical index based lease term to corresponding month/year string
     * @param lease_term_idx
     * @returns {*}
     * @private
     */
    _lease_term_to_date_str(lease_term_idx) {
        if (lease_term_idx === 0)
            return undefined;

        let term_year = 2018;
        while (lease_term_idx > 12) {
            term_year++;
            lease_term_idx -= 12;
        }
        lease_term_idx++;
        return lease_term_idx.toString() + '/' + term_year.toString();
    }

    /**
     * Gets the current price per bit from the smart contract for the current lease term
     * @returns {Promise<number>}
     */
    async price_per_bit_current_term() {
        return await this._rental_contract.methods.getPricePerBitCurrentTerm().call() / TOKEN_PRECISION;
    }

    /**
     * Gets the indicative price per bit from the smart contract for the next lease term
     * @returns {Promise<number>}
     */
    async indicative_price_per_bit_next_term() {
        return await this._rental_contract.methods.getIndicativePricePerBitNextTerm().call() / TOKEN_PRECISION;
    }

    /**
     * Checks if the current client specified in the constructor is a power user
     * @returns {Promise<bool>}
     */
    is_power_user() {
        return this._rental_contract.methods.isPowerUser().call({from: this.address});
    }

    /**
     * Returns the beneficiary address for the client specified in the constructor if any
     * @returns {Promise<string>}
     */
    beneficiary() {
        if (this.address === undefined)
            return Promise().resolve('0x0000000000000000000000000000000000000000');
        return this._rental_contract.methods.getBeneficiary().call({from: this.address});
    }

    /**
     * Returns the Total Incremental Usefulness of all the leptons added to the chain
     * @returns {Promise<number>}
     */
    async total_incremental_usefulness() {
        return await this._rental_contract.methods.getTotalIncrementalUsefulness().call() / IU_PRECISION;
    }

    /**
     * Returns the current number of seats available for lease
     * @returns {Promise<number>}
     */
    async seats_available() {
        const seats = await this._rental_contract.methods.getSeatsAvailable().call();
        return parseInt(seats);
    }

    /**
     * Returns the total number of seats leased in the current lease term
     * @returns {Promise<number>}
     */
    async current_term_seats() {
        const client = await this.get_client_address(this.address);
        if (typeof client === 'undefined')
            return 0;
        return this._rental_contract.methods.getCurrentTermSeats().call({from: client});
    }

    /**
     * Returns the indicative total number of seats leased in the next lease term
     * @returns {Promise<number>}
     */
    async next_term_seats() {
        const client = await this.get_client_address(this.address);
        if (typeof client === 'undefined')
            return 0;
        return this._rental_contract.methods.getNextTermSeats().call({from: client});
    }

    /**
     * Returns an object containing a complete summary of the current client, including: escrow balance, DVZ balance,
     * beneficiary address, current term seats, indicative next term seats, power user status, and historical data
     * access status
     * @returns {Promise<object>}
     */
    async client_summary() {
        let summary;
        try {
            summary = await this.get_client_summary(this.address);
        }
        catch (err) {
            console.log("No client found for address %s", this.address);
            return;
        }
        return summary;
    }

    /**
     * Returns and hashes and incremental usefulness of all the leptons added to the chain
     * @returns {Promise<Array>}
     */
    async get_all_leptons() {
        const count = await this._rental_contract.methods.getNumberOfLeptons().call();
        let leptons = [];
        let prev_hash;
        for (let i = 0; i < count; i++) {
            const lepton = await this._rental_contract.methods.getLepton(i).call();
            const lepton_hash = lepton[0];
            const contract_iu = lepton[1];
            leptons.push({
                hash: lepton_hash,
                previous_hash: prev_hash,
                incremental_usefulness: contract_iu / IU_PRECISION
            });
            prev_hash = lepton_hash;
        }
        return leptons;
    }

    /**
     * Get account summaries of all the addresses that have ever provisioned tokens.
     * @returns {Promise<Array>}
     */
    async get_all_clients() {
        const count = await this._rental_contract.methods.getNumberOfClients().call();
        let clients = [];
        for (let i = 0; i < count; i++) {
            const client = await this._rental_contract.methods.getClient(i).call();
            const summary = await this.get_client_summary(client);
            clients.push(summary);
        }
        return clients;
    }

    /**
     * Get renter account summaries of all current lease term renters from the smart contract
     * @returns {Promise<Array>}
     */
    async get_all_renters() {
        const count = await this._rental_contract.methods.getNumberOfRenters().call();
        let renters = [];
        for (let i = 0; i < count; i++) {
            const renter = await this._rental_contract.methods.getRenter(i).call();
            const summary = await this.get_client_summary(renter);
            renters.push(summary);
        }
        return renters;
    }

    /**
     * Returns an object containing a complete summary of the client specified, including: escrow balance, DVZ balance,
     * beneficiary address, current term seats, indicative next term seats, power user status, and historical data
     * access status
     */
    async get_client_summary(clientAddress) {
        const summary = await this._rental_contract.methods.getClientSummary(clientAddress).call();
        let res = {};
        res['client'] = clientAddress;
        res['beneficiary'] = summary['0'];
        res['dvz_balance_escrow'] = summary['1'] / TOKEN_PRECISION;
        res['dvz_balance'] = summary['2'] / TOKEN_PRECISION;
        res['last_term_paid'] = this._lease_term_to_date_str(summary['3']);
        res['power_user'] = summary['4'];
        res['historical_data_access'] = summary['5'];
        res['current_term_seats'] = summary['6'];
        res['indicative_next_term_seats'] = summary['7'];
        return res;
    }

    /**
     * Gets a list of all the bids including address, number of seats requested, and limit price
     * @param active Only return bidders with sufficient token balances to participate in auction
     * @returns {Promise<Array>}
     */
    async get_all_bidders(active = false) {
        let bids = [];
        let row = await this._rental_contract.methods.getHighestBidder().call();

        while (row) {
            try {
                const {'0': address, '1': requested_seats, '2': _limit_price} = row;
                const limit_price = _limit_price / TOKEN_PRECISION;
                if (address === "0x0000000000000000000000000000000000000000") {
                    row = await this._rental_contract.methods.getNextHighestBidder(address).call();
                    continue;
                }
                if (!active || this._has_sufficient_funds(address, requested_seats, _limit_price))
                    bids.push({address, requested_seats, limit_price});
                row = await this._rental_contract.methods.getNextHighestBidder(address).call();
            }
            catch (err) {
                break;
            }
        }
        return bids;
    }

    async get_owner_eth_balance() {
        const owner = await this._rental_contract.methods.owner().call();
        return await this.get_eth_balance(owner);
    }

    async get_escrow_wallet_address() {
        return await this._rental_contract.methods.escrowWallet().call();
    }

    async get_revenue_wallet_address() {
        return await this._rental_contract.methods.revenueWallet().call();
    }

    async balance_of_escrow_wallet() {
        const escrow = await this.get_escrow_wallet_address();
        return (await this._token_contract.methods.balanceOf(escrow).call()) / TOKEN_PRECISION;
    }

    async balance_of_revenue_wallet() {
        const revenue = await this.get_revenue_wallet_address();
        return (await this._token_contract.methods.balanceOf(revenue).call()) / TOKEN_PRECISION;
    }

    async get_all_implementations() {
        const res = await this._rental_contract.methods.getAllImplementations().call();
        return res[1].map((ver, idx) => {
            let obj = {};
            obj["ver"] = parseInt(ver);
            obj["impl"] = res[0][idx];
            return obj;
        });
    }
}

module.exports = RentalContract;
