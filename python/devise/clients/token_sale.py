# -*- coding: utf-8 -*-
"""
    devise.clients.TokenSale
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the class for all token sale contract operations

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
import json
from datetime import datetime

import requests
from eth_utils import to_wei

from devise.base import costs_gas, BaseDeviseClient

TOKEN_PRECISION = int(1e6)


class TokenSale(BaseDeviseClient):
    """
    This is the class for all token sale operations
    """

    @property
    def opening_time(self):
        """
        Query the opening time for the token sale contract
        """
        timestamp = self._token_sale_contract.functions.openingTime().call()
        return datetime.fromtimestamp(timestamp)

    @property
    def closing_time(self):
        """
        Query the closing time for the token sale contract
        """
        timestamp = self._token_sale_contract.functions.closingTime().call()
        return datetime.fromtimestamp(timestamp)

    @property
    def eth_dvz_rate(self):
        """
        Query the exchange rate between ether and Devise token, expressed in
        the number of tokens one ether can buy
        """
        return self._token_sale_contract.functions.getCurrentRate().call()

    def has_closed(self):
        """
        Query whether the token sale contract has closed
        """
        return self._token_sale_contract.functions.hasClosed().call()

    @property
    def remaining_tokens(self):
        """
        Query the number of tokens remained for sale
        """
        return self._token_sale_contract.functions.remainingTokens().call() / TOKEN_PRECISION

    def _has_min_order_size(self, ethers):
        return self._token_sale_contract.functions.hasMinimumOrderSize(to_wei(ethers, "ether")).call()

    def ether_cost(self, dvz):
        """
        A helper function to calculate the amount of ethers needed to buy the specified amount
        Devise tokens
        :param dvz: The number of Devise tokens you want to purchase
        :return: The amounts of ethers required to buy above mentioned Devise tokens
        """
        rate = self.eth_dvz_rate
        ethers = dvz / rate + 1 / (rate * TOKEN_PRECISION)
        return ethers

    def _buy_tokens(self, ethers):
        self.logger.info("Purchasing %s Ethers worth of DVZ tokens..." % ethers)

        ret = self._has_min_order_size(ethers)
        if not ret[0]:
            self.logger.info(
                "Buying less than %f Devise tokens or %f ethers worth of Devise tokens isn't allowed at this point.",
                ret[1] / TOKEN_PRECISION, ret[2] / TOKEN_PRECISION)
            raise ValueError
        else:
            return self._transact(transaction={
                "to": self._token_sale_contract.address,
                "from": self.address,
                "value": to_wei(ethers, "ether")})

    @costs_gas
    def buy_tokens(self, dvz):
        """
        Purchase specified amount of Devise tokens using ethers
        :param dvz: The number of Devise tokens you want to purchase
        """
        ethers = self.ether_cost(dvz)
        return self._buy_tokens(ethers)

    @costs_gas
    def buy_eth_worth_of_tokens(self, ethers):
        """
        Transfers ethers into the DeviseTokenSale Contract to get Devise Tokens
        :param ethers: The amount of ether you would like to spend to buy Devise tokens
        """

        return self._buy_tokens(ethers)

    @costs_gas
    def buy_usd_worth_of_tokens(self, usd):
        """
        Transfers ethers into the DeviseTokenSale Contract to get Devise Tokens
        :param usd: The amount ethers you would like to spend (denominated in US dollars) to buy Devise tokens
        """
        price = json.loads(requests.get('https://api.gdax.com/products/ETH-USD/ticker').text).get("price", None)
        self.logger.info("Purchasing DVZ tokens at the exchange rate of $%s per ether", price)
        ethers = usd / float(price)
        return self._buy_tokens(ethers)
