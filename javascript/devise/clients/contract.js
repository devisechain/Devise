const BaseClient = require('../base');
const BaseDeviseClient = BaseClient.BaseDeviseClient;
const IU_PRECISION = 10 ** 6;
const TOKEN_PRECISION = 10 ** 6;
const ETHER_PRECISION = 10 ** 18;

class RentalContract extends BaseDeviseClient {
    constructor(account, nodel_url, network) {
        super(account, nodel_url, network);
    }

    async _has_sufficient_funds(clientAddress, numSeats, limitPrice) {
        const currentBalance = await this._rental_contract.methods.getAllowance().call({from: clientAddress}) / TOKEN_PRECISION;
        return limitPrice * this.total_incremental_usefulness() * numSeats <= currentBalance;
    }

    async get_client_address(address) {
        const clientAddress = await this._rental_contract.methods.getClientForBeneficiary().call({from: address});
        if (clientAddress !== '0x0000000000000000000000000000000000000000')
            return clientAddress;
    }

    async dvz_balance() {
        const bal = await this._token_contract.methods.balanceOf(this.address).call({from: this.address}) / TOKEN_PRECISION;
        return bal;
    }

    async eth_balance() {
        if (this.address === undefined)
            return 0;
        const bal = await this.web3.eth.getBalance(this.address) / ETHER_PRECISION;
        return bal;
    }

    async dvz_balance_escrow() {
        const allow = await this._rental_contract.methods.getAllowance().call({from: this.address}) / TOKEN_PRECISION;
        return allow;
    }

    async rent_per_seat_current_term() {
        const rent = await this._rental_contract.methods.getRentPerSeatCurrentTerm().call() / TOKEN_PRECISION;
        return rent;
    }

    async indicative_rent_per_seat_next_term() {
        const rent = await this._rental_contract.methods.getIndicativeRentPerSeatNextTerm().call() / TOKEN_PRECISION;
        return rent;
    }

    async current_lease_term() {
        const idx = await this._rental_contract.methods.getCurrentLeaseTerm().call();
        return this._lease_term_to_date_str(idx);
    }

    _lease_term_to_date_str(leaseTermIdx) {
        if (leaseTermIdx === 0)
            return undefined;

        let termYear = 2018;
        while (leaseTermIdx > 12) {
            termYear++;
            leaseTermIdx -= 12;
        }
        leaseTermIdx++;
        return leaseTermIdx.toString() + '/' + termYear.toString();
    }

    async price_per_bit_current_term() {
        const price = await this._rental_contract.methods.getPricePerBitCurrentTerm().call() / TOKEN_PRECISION;
        return price;
    }

    async indicative_price_per_bit_next_term() {
        const price = await this._rental_contract.methods.getIndicativePricePerBitNextTerm().call() / TOKEN_PRECISION;
        return price;
    }

    is_power_user() {
        return this._rental_contract.methods.isPowerUser().call({from: this.address});
    }

    beneficiary() {
        if (this.address === undefined)
            return '0x0000000000000000000000000000000000000000';
        return this._rental_contract.methods.getBeneficiary().call({from: this.address});
    }

    async total_incremental_usefulness() {
        const totalIU = await this._rental_contract.methods.getTotalIncrementalUsefulness().call() / IU_PRECISION;
        return totalIU;
    }

    async seats_available() {
        const seats = await this._rental_contract.methods.getSeatsAvailable().call();
        return parseInt(seats);
    }

    async current_term_seats() {
        const client = await this.get_client_address(this.address);
        if (typeof client === 'undefined')
            return 0;
        return this._rental_contract.methods.getCurrentTermSeats().call({from: client});
    }

    async next_term_seats() {
        const client = await this.get_client_address(this.address);
        if (typeof client === 'undefined')
            return 0;
        return this._rental_contract.methods.getNextTermSeats().call({from: client});
    }

    async client_summary() {
        try {
            const summary = await this.get_client_summary(this.address);
        }
        catch (err) {
            console.log("No client found for address %s", this.address);
            return;
        }
        return summary;
    }

    async get_all_leptons() {
        const count = await this._rental_contract.methods.getNumberOfLeptons().call();
        let leptons = [];
        let prevHash;
        for (let i = 0; i < count; i++) {
            const lepton = await this._rental_contract.methods.getLepton(i).call();
            const leptonHash = lepton[0];
            const contractIU = lepton[1];
            leptons.push({hash: leptonHash, previousHash: prevHash, incrementalUsefulness: contractIU / IU_PRECISION});
            prevHash = leptonHash;
        }
        return leptons;
    }

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

    async get_client_summary(clientAddress) {
        const summary = await this._rental_contract.methods.getClientSummary(clientAddress).call();
        let res = {};
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

    async get_all_bidders(active = false) {
        let bids = [];
        let _bidder = await this._rental_contract.methods.getHighestBidder().call();
        let bidder = {};
        bidder['address'] = _bidder['0'];
        bidder['requested_seats'] = _bidder['1'];
        bidder['limit_price'] = _bidder['2'] / TOKEN_PRECISION;
        if (bidder['address'] === "0x0000000000000000000000000000000000000000")
            return bids;

        if (!active || this._has_sufficient_funds(bidder['address'], bidder['requested_seats'], bidder['limit_price']))
            bids.push(bidder);
        while (true) {
            try {
                _bidder = await this._rental_contract.methods.getNextHighestBidder(bidder['address']).call();
                bidder['address'] = _bidder['0'];
                bidder['requested_seats'] = _bidder['1'];
                bidder['limit_price'] = _bidder['2'] / TOKEN_PRECISION;
                if (bidder['address'] === "0x0000000000000000000000000000000000000000")
                    continue;
                if (!active || this._has_sufficient_funds(bidder['address'], bidder['requested_seats'], bidder['limit_price']))
                    bids.push(bidder);
            }
            catch (err) {
                break;
            }
        }
        return bids;
    }
}

module.exports = RentalContract;
