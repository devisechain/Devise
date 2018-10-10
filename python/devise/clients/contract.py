# -*- coding: utf-8 -*-
"""
    devise.clients.RentalContract
    ~~~~~~~~~
    This is the wrapper around all the client facing smart contract operations. This wrapper connects to an Ethereum
    node and facilitates smart contract operations such as provision, leaseAll, getBalance, etc.

    :copyright: © 2018 Pit.AI
    :license: GPLv3, see LICENSE for more details.
"""
from datetime import datetime

from web3 import Web3

from devise.base import costs_gas, generate_account, BaseDeviseClient, get_contract_abi, get_rental_contract_addresses, \
    get_events_node_url
from .token import TOKEN_PRECISION

IU_PRECISION = 1e6
ETHER_PRECISION = int(1e18)
USD_PRECISION = int(1e8)


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
    def eth_usd_rate(self):
        return self._rental_contract.functions.rateETHUSD().call() / USD_PRECISION

    @property
    def usd_dvz_rate(self):
        return self._rental_contract.functions.RATE_USD_DVZ().call()

    @property
    def eth_dvz_rate(self):
        return self.eth_usd_rate * self.usd_dvz_rate;

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
        all_leptons = self._rental_contract.functions.getAllLeptons().call()
        leptons = []
        prev_hash = None
        for idx, lepton_hash in enumerate(all_leptons[0]):
            contract_iu = all_leptons[1][idx]
            lepton_hash = lepton_hash.hex()
            leptons.append({
                "hash": lepton_hash,
                "previous_hash": prev_hash,
                "incremental_usefulness": contract_iu / IU_PRECISION
            })
            prev_hash = lepton_hash

        return leptons

    def get_all_clients(self):
        """
        Get account summaries of all the addresses that have ever provisioned tokens.
        :return: a list dicts containing the account summary of each address
        """
        all_clients = self._rental_contract.functions.getAllClients().call()
        clients = []
        for client in all_clients:
            clients.append(self.get_client_summary(client))

        return clients

    def get_all_renters(self):
        """
        Get renter account summaries of all current lease term renters from the smart contract
        :return: a list of dicts containing the renters' account summaries
        """
        all_renters = self._rental_contract.functions.getAllRenters().call()
        clients = []
        for client in all_renters:
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
        all_bidders = self._rental_contract.functions.getAllBidders().call()
        for idx, client in enumerate(all_bidders[0]):
            bidder = {"address": client, "requested_seats": all_bidders[1][idx], "limit_price": all_bidders[2][idx]}
            bidder["limit_price"] = bidder["limit_price"] / TOKEN_PRECISION
            if bidder["address"] == "0x0000000000000000000000000000000000000000":
                continue
            # If active==True, only active bidders with enough funds to cover their bid
            if not active or \
                    self._has_sufficient_funds(bidder["address"], bidder["requested_seats"], bidder["limit_price"]):
                bids.append(bidder)

        return bids

    @costs_gas
    def provision(self, tokens):
        """Sends tokens from the current account to the clients contract"""
        assert self.dvz_balance >= tokens, "Please make sure you have enough DVZ in you wallet."
        self.logger.info("Approving token transfer to rental contract...")
        micro_tokens = int(tokens * TOKEN_PRECISION)
        # Approve tokens transfer into the clients contract
        accounting_contract = self._rental_contract.functions.accounting().call()
        self._transact(self._token_contract.functions.approve(accounting_contract, micro_tokens),
                       {"from": self.address})

        self.logger.info("Provisioning rental contract with %s DVZ tokens..." % tokens)
        # Actually transfer the tokens
        tx_receipt = self._transact(self._rental_contract.functions.provision(micro_tokens), {"from": self.address})

        return tx_receipt

    @costs_gas
    def provision_on_behalf_of(self, recipient, tokens):
        """Provision a client's escrow account with tokens directly"""
        assert self.dvz_balance >= tokens
        self.logger.info("Approving token transfer to rental contract...")
        micro_tokens = int(tokens * TOKEN_PRECISION)
        # Approve tokens transfer into the clients contract
        accounting_contract = self._rental_contract.functions.accounting().call()
        self._transact(self._token_contract.functions.approve(accounting_contract, micro_tokens),
                       {"from": self.address})

        self.logger.info("Provisioning escrow account %s with %s DVZ tokens..." % (recipient, tokens))
        recipient = Web3.toChecksumAddress(recipient)
        return self._transact(self._rental_contract.functions.provisionOnBehalfOf(recipient, micro_tokens),
                              {"from": self.address})

    @costs_gas
    def provision_with_ether(self, ether):
        """Purchase tokens with ether amount and provision them to the rental contract"""
        assert self.eth_balance >= ether, "Please make sure you have enough ethers in you wallet."
        tx_receipt = self._transact(self._rental_contract.functions.provisionWithEther(),
                                    {"from": self.address, "value": self.w3.toWei(ether, "ether")})
        return tx_receipt

    @costs_gas
    def fund_account(self, amount, unit, source):
        """
        Fund a client's escrow account by specifying the source of funding: ETH or DVZ
        the unit of amount: ETH, USD or DVZ and the funding amount
        :param amount: the funding amount, float type
        :param unit: unit for funding amount, ETH for ether, USD for US dollar, or DVZ for Devise token
        :param source: funding source, ETH for ether wallet or DVZ for token wallet
        """
        assert unit.upper() in ['ETH', 'USD', 'DVZ'], "unit must be one of ETH, USD or DVZ"
        assert source.upper() in ['ETH', 'DVZ'], "source must be either ETH or DVZ"
        if source.upper() == 'ETH':
            if unit.upper() == 'ETH':
                return self.provision_with_ether(amount)
            elif unit.upper() == 'USD':
                rate = self.eth_usd_rate
                _amt = amount / rate
                return self.provision_with_ether(_amt)
            else:
                rate = self.eth_dvz_rate
                _amt = amount / rate
                return self.provision_with_ether(_amt)
        else:
            if unit.upper() == 'DVZ':
                return self.provision(amount)
            elif unit.upper() == 'ETH':
                rate = self.eth_dvz_rate
                _amt = amount * rate
                return self.provision(_amt)
            else:
                rate = self.usd_dvz_rate
                _amt = amount * rate
                return self.provision(_amt)

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
        if self.client_summary["power_user"]:
            return True

        assert self.dvz_balance_escrow >= self.indicative_rent_per_seat_next_term, (
                "Insuffient DVZ balance in escrow, please provision at least %s DVZ tokens and try again" % (
                self.indicative_rent_per_seat_next_term - self.dvz_balance_escrow))

        self._transact(self._rental_contract.functions.applyForPowerUser(), {"from": self.address})
        return self.client_summary["power_user"]

    @costs_gas
    def request_historical_data_access(self):
        """
        Gain access to historical data archives
        :return bool The historical data access status (True if status change succeeds, False if it failed)
        """
        if self.client_summary["historical_data_access"]:
            return True

        assert self.dvz_balance_escrow >= self.indicative_rent_per_seat_next_term, (
                "Insuffient DVZ balance in escrow, please provision at least %s DVZ tokens and try again" % (
                self.indicative_rent_per_seat_next_term - self.dvz_balance_escrow))

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

    @property
    def event_names(self):
        return sorted(event['name'] for event in self._rental_contract.events._events)

    def get_events(self, event_name):
        """
        Returns all events of a type from the rental smart contract
        :param event_name: The event for which we want all entries from the blockchain
        :return: a list of dict containing transaction, block_number, block_timestamp, event, and event_args
        """

        network_id = self._get_network_id()
        w3 = self.w3
        # Load different provider for querying events if any
        node_url = get_events_node_url(network_id=network_id)
        current_provider = self.w3.providers[0]
        if node_url and current_provider.endpoint_uri != node_url:
            w3 = Web3(self._get_provider(node_url))

        # Filter from a recent block preceding any deployment to avoid timing out
        from_block = 5934817 if int(network_id) == 1 else 0
        events = []

        # Get the contract abi so we can build our topic filter
        rental_abi = get_contract_abi('DeviseRentalImpl')

        # get all previous rental contract addresses in case of forks
        rental_contracts = get_rental_contract_addresses(network_id=network_id)
        for contract_address in rental_contracts:
            contract = w3.eth.contract(address=contract_address, abi=rental_abi)
            try:
                event_filter = contract.eventFilter(event_name, {'fromBlock': from_block, 'toBlock': 'latest'})
                events += event_filter.get_all_entries()
            except ValueError:
                # event is not declared in this contract, skip
                pass

        # Also add matching event from standalone audit contract
        audit_abi = get_contract_abi('AuditImpl')
        contract = w3.eth.contract(address=self._audit_contract.address, abi=audit_abi)
        try:
            event_filter = contract.eventFilter(event_name, {'fromBlock': from_block, 'toBlock': 'latest'})
            events += event_filter.get_all_entries()
        except ValueError:
            # event is not declared in this contract, skip
            pass

        # Format events for humans
        results = []
        for event in events:
            block_timestamp = self.get_block_timestamp(event["blockNumber"])
            block_datetime = datetime.utcfromtimestamp(block_timestamp)
            results += [{
                "transaction": event["transactionHash"].hex(),
                "block_number": event["blockNumber"],
                "block_timestamp": self.get_block_timestamp(event["blockNumber"]),
                "block_datetime": block_datetime,
                "event": event["event"],
                "event_args": self._format_event_args(event_name, event['args'])
            }]
        return results

    def _format_event_args(self, event_name, args):
        """Given a dictionary of arguments from events, formats them to humanly readable keys and values"""
        formatted_args = {}
        for key, value in args.items():
            formatted_key = self._format_event_arg_key(event_name, key)
            formatted_args[formatted_key] = self._format_event_arg_value(event_name, key, value)

        return formatted_args

    def _format_event_arg_key(self, event_name, key):
        """Applies custom formatters if any for particular event keys"""
        key_formatters = {
            'LeptonAdded': {
                's': 'lepton_hash',
                'iu': 'incremental_usefulness'
            },
            'BeneficiaryChanged': {
                'addr': 'client_address',
                'ben': 'beneficiary_address'
            },
            'AuctionPriceSet': {
                'prc': 'price_per_bit'
            }
        }
        converted_key = key_formatters.get(event_name, {}).get(key, None)
        return converted_key if converted_key else key

    def _format_event_arg_value(self, event_name, key, value):
        """Applies custom formatters if any for particular event values"""
        value_formatters = {
            'RateUpdated': {
                'rate': lambda rate: "$ %f" % (rate / USD_PRECISION),
            },
            'LeptonAdded': {
                'iu': lambda iu: iu / IU_PRECISION
            },
            'AuctionPriceSet': {
                'prc': lambda price: price / TOKEN_PRECISION
            }
        }
        formatter = value_formatters.get(event_name, {}).get(key, None)
        if formatter:
            return formatter(value)
        if type(value) == bytes:
            return value.hex()
        return value

    def get_block_timestamp(self, block_number):
        return self.w3.eth.getBlock(block_number)['timestamp']
