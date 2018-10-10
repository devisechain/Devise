# -*- coding: utf-8 -*-
"""
    devise.owner.DeviseOwner
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the base class for all smart contract operations from Pit.AI (owner of the smart contract).

    :copyright: © 2018 Pit.AI
    :license: GPLv3, see LICENSE for more details.
"""
import hashlib
import json
from json import JSONDecodeError

import requests

from devise.base import costs_gas, BaseDeviseClient
from devise.clients.contract import USD_PRECISION
from devise.clients.token import TOKEN_PRECISION

EVENT_TYPES = {
    "LATEST_WEIGHTS_UPDATED": "LatestWeightsUpdated"
}


class DeviseOwner(BaseDeviseClient):
    """
    This is the base class for all smart contract operations from Pit.AI (owner of the smart contract).
    """

    @property
    def implementation(self):
        return self._rental_proxy_contract.functions.implementation().call()

    @property
    def impl_version(self):
        return self._rental_proxy_contract.functions.version().call()

    def get_all_implementations(self):
        [impl_history, ver_history] = self._rental_proxy_contract.functions.getAllImplementations().call()
        history = [{"ver": _ver, "impl": _impl} for _ver, _impl in zip(ver_history, impl_history)]
        return history

    def get_master_nodes(self):
        """returns a list of all authorized master nodes"""
        return self._rental_contract.functions.getMasterNodes().call()

    def get_rate_setter(self):
        return self._rental_contract.functions.rateSetter().call()

    def get_audit_updater(self):
        return self._audit_contract.functions.auditUpdater().call()

    def get_escrow_history(self):
        return self._rental_contract.functions.getEscrowHistory().call()

    def get_revenue_history(self):
        return self._rental_contract.functions.getRevenueHistory().call()

    @costs_gas
    def set_historical_data_fee(self, tokens):
        """
        Updates the cost in tokens to gain access to the historical weights and returns data archive
        :param tokens: the amount of tokens paid to change the account status historical data access status
        """
        micro_tokens = tokens * TOKEN_PRECISION
        return self._transact(self._rental_contract.functions.setHistoricalDataFee(micro_tokens),
                              {"from": self.address})

    @costs_gas
    def set_power_user_fee(self, tokens):
        """
        Updates the cost in tokens to gain power user privileges
        :param tokens: the amount of tokens paid to change the account status to power user
        """
        micro_tokens = tokens * TOKEN_PRECISION
        return self._transact(self._rental_contract.functions.setPowerUserClubFee(micro_tokens), {"from": self.address})

    @costs_gas
    def update_contract_state(self):
        """
        Updates the internal state of the contract
        """
        return self._transact(self._rental_contract.functions.updateGlobalState(), {"from": self.address})

    @costs_gas
    def add_master_node(self, address):
        """Authorizes an address to perform the master node role"""
        return self._transact(self._rental_contract.functions.addMasterNode(address), {"from": self.address})

    @costs_gas
    def remove_master_node(self, address):
        """Unauthorizes an address to perform the master node role"""
        return self._transact(self._rental_contract.functions.removeMasterNode(address), {"from": self.address})

    @costs_gas
    def add_rate_setter(self, address):
        return self._transact(self._rental_contract.functions.addRateSetter(address), {"from": self.address})

    @costs_gas
    def remove_rate_setter(self, address):
        return self._transact(self._rental_contract.functions.removeRateSetter(address), {"from": self.address})

    @costs_gas
    def add_audit_updater(self, address):
        return self._transact(self._audit_contract.functions.addAuditUpdater(address), {"from": self.address})

    @costs_gas
    def remove_audit_updater(self, address):
        return self._transact(self._audit_contract.functions.removeAuditUpdater(address), {"from": self.address})

    @costs_gas
    def set_eth_usd_rate(self):
        try:
            price = self._get_eth_usd_price()
        except JSONDecodeError:
            self.logger.info("!!!!!! WARNING: ERROR WHEN GETTING REAL TIME ETHER/USD PRICE. "
                             "PLEASE TRY AGAIN LATER. !!!!!")
            price = None
        assert price is not None, "Fail to get real time Ether price. Please try again later!!!"
        self.logger.info("Setting the exchange rate at $%s per ether", price)
        price = int(float(price) * USD_PRECISION)
        assert price > 0
        self._transact(self._rental_contract.functions.setRateETHUSD(price), {"from": self.address})

    def _validate_hash(self, content_hash):
        # Validate hash received
        try:
            assert len(content_hash) == 40, "Hash provided must be a valid sha1 hash"
            hash_bytes = bytes.fromhex(content_hash)
        except ValueError:
            raise AssertionError("Hash provided must be a valid sha1 hash")

        return hash_bytes

    @costs_gas
    def latest_weights_updated(self, content_hash):
        """
        Triggers a transaction which emits an event of type LatestWeightsUpdated from the rental smart contract
        :param content_hash: The sha1 hash of the content of the file as a hex string
        :return: True if the transaction is successful and False otherwise
        """
        # Validate hash received
        hash_bytes = self._validate_hash(content_hash)

        # Build a transaction with double the gas price estimated
        transaction = {
            "from": self.address,
            "gasPrice": self.w3.eth.generateGasPrice() * 2
        }
        event_type = EVENT_TYPES["LATEST_WEIGHTS_UPDATED"]
        event_type_hash = hashlib.sha1(event_type.encode('utf8')).hexdigest()
        return self._transact(
            self._audit_contract.functions.createAuditableEvent(event_type_hash, event_type, hash_bytes),
            transaction)

    def _get_eth_usd_price(self):
        return json.loads(requests.get('https://api.gdax.com/products/ETH-USD/ticker').text).get("price", None)
