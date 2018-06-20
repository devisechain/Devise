# -*- coding: utf-8 -*-
"""
    devise.clients.RentalContract
    ~~~~~~~~~
    This is the wrapper around all the client facing smart contract operations. This wrapper connects to an Ethereum
    node and facilitates smart contract operations such as provision, leaseAll, getBalance, etc.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""

from devise.base import costs_gas, generate_account, BaseDeviseClient

from .token import TOKEN_PRECISION

IU_PRECISION = 1e6
ETHER_PRECISION = int(1e18)


class RentalContract(BaseDeviseClient):
    """

    """

    def _has_sufficient_funds(self, client_address, num_seats, limit_price):
        """
        Checks if a client has enough tokens provisioned to cover the requested seats and limit price if selected.
        :param client_address: the client's address (the money account)
        :param num_seats: the client's requested seats
        :param limit_price: the client's max price
        :return: True if token balance is sufficient, False otherwise
        """
        current_balance = self._rental_contract.functions.getAllowance().call(
            {'from': client_address}) / TOKEN_PRECISION
        return limit_price * self.total_incremental_usefulness * num_seats <= current_balance

    def get_client_address(self, address):
        """
        Finds the client address for a beneficiary if the address provided is a beneficiary
        :param address: The client address corresponding to this address
        :return: address of the money account corresponding to the beneficiary address specified
        """
        client_address = self._rental_contract.functions.getClientForBeneficiary().call({"from": address})
        if client_address != "0x0000000000000000000000000000000000000000":
            return client_address

    @property
    def dvz_balance(self):
        """Queries the DeviseToken contract for the token balance of the current account"""
        return self._token_contract.functions.balanceOf(self.address).call({'from': self.address}) / TOKEN_PRECISION

    @property
    def eth_balance(self):
        return self.w3.eth.getBalance(self.address) / ETHER_PRECISION

    @property
    def dvz_balance_escrow(self):
        """Queries the Devise rental contract for the number of tokens provisioned into the rental contract for this account"""
        return self._rental_contract.functions.getAllowance().call({'from': self.address}) / TOKEN_PRECISION

    @property
    def rent_per_seat_current_term(self):
        return self._rental_contract.functions.getRentPerSeatCurrentTerm().call() / TOKEN_PRECISION

    @property
    def indicative_rent_per_seat_next_term(self):
        return self._rental_contract.functions.getIndicativeRentPerSeatNextTerm().call() / TOKEN_PRECISION

    @property
    def current_lease_term(self):
        lease_term_idx = self._rental_contract.functions.getCurrentLeaseTerm().call()
        return self._lease_term_to_date_str(lease_term_idx)

    def _lease_term_to_date_str(self, lease_term_idx):
        # 0 means never paid any
        if lease_term_idx == 0:
            return None

        # convert index to month/year string
        term_year = 2018
        while lease_term_idx > 12:
            term_year += 1
            lease_term_idx -= 12
        return '%s/%s' % (1 + lease_term_idx, term_year)

    @property
    def price_per_bit_current_term(self):
        return self._rental_contract.functions.getPricePerBitCurrentTerm().call() / TOKEN_PRECISION

    @property
    def indicative_price_per_bit_next_term(self):
        return self._rental_contract.functions.getIndicativePricePerBitNextTerm().call() / TOKEN_PRECISION

    @property
    def is_power_user(self):
        return self._rental_contract.functions.isPowerUser().call({'from': self.address})

    @property
    def beneficiary(self):
        return self._rental_contract.functions.getBeneficiary().call({'from': self.address})

    @property
    def total_incremental_usefulness(self):
        return self._rental_contract.functions.getTotalIncrementalUsefulness().call() / IU_PRECISION

    @property
    def seats_available(self):
        return self._rental_contract.functions.getSeatsAvailable().call()

    @property
    def current_term_seats(self):
        """
        Get the number of seats that were allocated to the authenticated client for the current lease term.
        """
        client_address = self.get_client_address(self.address)
        if client_address is None:
            return 0
        return self._rental_contract.functions.getCurrentTermSeats().call({'from': client_address})

    @property
    def next_term_seats(self):
        """
        Get the number of seats to be awarded to the authenticated client next lease term based on currently available information.
        """
        client_address = self.get_client_address(self.address)
        if client_address is None:
            return 0
        return self._rental_contract.functions.getNextTermSeats().call({'from': client_address})

    @property
    def client_summary(self):
        try:
            client_summary = self.get_client_summary(self.address)
        except Exception:
            self.logger.error("No client found for address %s!" % self.address)
            return

        return client_summary

    def get_all_leptons(self):
        """
        Returns the list of leptons currently on the Devise blockchain
        :return: a list of leptons in the order they were found and incremental usefulnesses added.
        """
        count = self._rental_contract.functions.getNumberOfStrategies().call()
        leptons = []
        prev_hash = None
        for i in range(count):
            lepton_hash2, lepton_hash1, contract_iu = self._rental_contract.functions.getStrategy(i).call()
            leptons.append({
                "hash": lepton_hash1 + lepton_hash2,
                "previous_hash": prev_hash,
                "incremental_usefulness": contract_iu / IU_PRECISION
            })
            prev_hash = lepton_hash1 + lepton_hash2

        return leptons

    def get_all_clients(self):
        """
        Get all current lease term client addresses from the smart contract
        :return: a list of the current renters of the leptons on the blockchain
        """
        count = self._rental_contract.functions.getNumberOfRenters().call()
        clients = []
        for i in range(count):
            client = self._rental_contract.functions.getRenter(i).call()
            clients.append(self.get_client_summary(client))

        return clients

    def get_client_summary(self, client_address):
        """
        For a given client address, returns the account summary of the client (the money account)
        :param client_address: the address of the money account (responsible for provisioning tokens and submitting bids,
             must have provisioned dvz tokens into the rental contract at least once)
        :return: a dictionary of account information for the client address given
        """
        keys = ['beneficiary', 'dvz_balance_escrow', 'dvz_balance', 'last_term_paid', 'power_user',
                'historical_data_access', 'current_term_seats', 'indicative_next_term_seats']

        summary = dict(zip(keys, self._rental_contract.functions.getClientSummary(client_address).call()))
        summary["client"] = client_address
        summary["dvz_balance_escrow"] = summary["dvz_balance_escrow"] / TOKEN_PRECISION
        summary["dvz_balance"] = summary["dvz_balance"] / TOKEN_PRECISION
        summary["last_term_paid"] = self._lease_term_to_date_str(int(summary["last_term_paid"]))

        return summary

    def get_all_bidders(self, active=False):
        """
        Gets a list of all the bids including address, number of seats requested, and limit price
        :param active: Only return bidders with sufficient token balances to participate in auction
        :return: a list of the current bids
        """
        bids = []
        keys = ['address', 'requested_seats', 'limit_price']
        bidder = dict(zip(keys, self._rental_contract.functions.getHighestBidder().call()))
        bidder["limit_price"] = bidder["limit_price"] / TOKEN_PRECISION
        # solidity null address is 0x0
        if bidder["address"] == "0x0000000000000000000000000000000000000000":
            return []

        # If active==True, only active bidders with enough funds to cover their bid
        if not active or self._has_sufficient_funds(bidder["address"], bidder["requested_seats"],
                                                    bidder["limit_price"]):
            bids = [bidder]
        while True:
            try:
                bidder = dict(zip(keys, self._rental_contract.functions.getNextHighestBidder(bidder["address"]).call()))
                bidder["limit_price"] = bidder["limit_price"] / TOKEN_PRECISION
                if bidder["address"] == "0x0000000000000000000000000000000000000000":
                    continue
                # If active==True, only active bidders with enough funds to cover their bid
                if not active or \
                        self._has_sufficient_funds(bidder["address"], bidder["requested_seats"], bidder["limit_price"]):
                    bids.append(bidder)
            except:
                break

        return bids

    @costs_gas
    def provision(self, tokens):
        """Sends tokens from the current account to the clients contract"""
        self.logger.info("Approving token transfer to rental contract...")
        micro_tokens = int(tokens * TOKEN_PRECISION)
        # Approve tokens transfer into the clients contract
        self._transact(self._token_contract.functions.approve(self._rental_contract.address, micro_tokens),
                       {"from": self.address})

        self.logger.info("Provisioning rental contract with %s DVZ tokens..." % tokens)
        # Actually transfer the tokens
        tx_receipt = self._transact(self._rental_contract.functions.provision(micro_tokens), {"from": self.address})

        return tx_receipt

    @costs_gas
    def withdraw(self, tokens):
        """
        Withdraw tokens from the clients contract back to the current account.

        :param tokens: Number of tokens up to the current allowance (see client_summary).
        """
        micro_tokens = int(tokens * TOKEN_PRECISION)
        return self._transact(self._rental_contract.functions.withdraw(micro_tokens), {"from": self.address})

    @costs_gas
    def lease_all(self, limit_price, num_seats):
        """
        Lease the specified number of seats on the blockchain, at a price per bit of total incremental usefulness and per seat
        up to the specified limit price.

        :param limit_price: The maximum price in Devise tokens you are willing to pay per bit of total incremental usefulness and per seat.
        :param num_seats: The number of seats to lease.
        :return: tx: the transaction receipt
        """
        micro_tokens = int(limit_price * TOKEN_PRECISION)
        self.logger.info("Placing a bid to lease all (limit price = %s, seats = %s)" % (limit_price, num_seats))
        assert self._has_sufficient_funds(self.address, num_seats, limit_price), \
            ("Insufficient clients token balance. Please provision enough tokens to cover "
             "limit price * number of seats * total_incremental_usefulness")
        return self._transact(self._rental_contract.functions.leaseAll(micro_tokens, num_seats), {"from": self.address})

    @costs_gas
    def cancel_bid(self):
        """
        Cancel any bid the authenticated client previously placed.
        """
        all_bids = self.get_all_bidders()
        for bid in all_bids:
            if bid["address"] == self.address:
                micro_tokens = int(bid["limit_price"] * TOKEN_PRECISION)
                return self._transact(self._rental_contract.functions.leaseAll(micro_tokens, 0), {"from": self.address})

        return False

    @costs_gas
    def designate_beneficiary(self, address):
        """
        Authorize an address to query the data on behalf of the current account
        :param address: The address to allow access to the data on behalf of the current account
        :return: tx: the transaction receipt
        """
        return self._transact(self._rental_contract.functions.designateBeneficiary(address), {"from": self.address})

    @costs_gas
    def apply_for_power_user(self):
        """
        Enable power user status on the current account. Subject to minimum balance requirement.
        :return bool The power user status (True if status change succeeds, False if it failed)
        """
        self._transact(self._rental_contract.functions.applyForPowerUser(), {"from": self.address})
        return self.client_summary["power_user"]

    @costs_gas
    def request_historical_data_access(self):
        """
        Gain access to historical data archives
        :return bool The historical data access status (True if status change succeeds, False if it failed)
        """
        self._transact(self._rental_contract.functions.requestHistoricalData(), {"from": self.address})
        return self.client_summary["historical_data_access"]

    @costs_gas
    def create_beneficiary(self):
        """
        Create a new account and designate the new account as beneficiary on behalf of the client
        :return: bool True if the transaction is successful, and False otherwise
        """
        acct = generate_account()
        self.logger.info("The path for the newly created account json keyfile is %s", acct[0])
        addr = acct[1]
        ret = self.designate_beneficiary(acct[1])
        return ret, addr
