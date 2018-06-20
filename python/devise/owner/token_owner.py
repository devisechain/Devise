# -*- coding: utf-8 -*-
"""
    devise.owner.DeviseTokenOwner
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the base class for all owner token operations contract operations

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
from devise.base import costs_gas
from devise.clients.token import DeviseToken


class DeviseTokenOwner(DeviseToken):
    """
    This is the base class for all owner token operations
    """

    @costs_gas
    def mint(self, address_to, tokens):
        """
        Mints the number of tokens specified to the beneficiary account specified
        :param address_to: the recipient of the minted tokens
        :param tokens: the amount of tokens minted
        """
        assert self.total_supply + tokens <= self.cap, "Minted tokens + total_supply cannot exceed the cap %s DVZ" % self.cap
        micro_dvz_amount = int(tokens * 1e6)
        return self._transact(self._token_contract.functions.mint(address_to, micro_dvz_amount), {"from": self.address})

    @costs_gas
    def add_minter(self, address):
        """
        Adds the minter role to authorize a new minter address
        :param address: the minter address to authorize to mint
        """
        self._transact(self._token_contract.functions.addMinter(address), {"from": self.address})

    @costs_gas
    def remove_minter(self, address):
        """
        Removes the minter role to de-authorize a minter address
        :param address: the minter address to remove the minter role from
        """
        self._transact(self._token_contract.functions.removeMinter(address), {"from": self.address})

    def get_minters(self):
        """
        Retrieve a list of minters
        :return: An array of minter addresses
        """
        minters = []
        n = self._token_contract.functions.getNumberOfMinters().call({"from": self.address})
        for i in range(n):
            minter = self._token_contract.functions.getMinter(i).call({"from": self.address})
            minters.append(minter)

        return minters
