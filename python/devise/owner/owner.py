# -*- coding: utf-8 -*-
"""
    devise.owner.DeviseOwner
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the base class for all smart contract operations from Pit.AI (owner of the smart contract).

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
from devise.base import costs_gas, BaseDeviseClient
from devise.clients.token import TOKEN_PRECISION


class DeviseOwner(BaseDeviseClient):
    """
    This is the base class for all smart contract operations from Pit.AI (owner of the smart contract).
    """

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
        return self._transact(self._rental_contract.functions.updateLeaseTerms(), {"from": self.address})
