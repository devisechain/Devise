# -*- coding: utf-8 -*-
"""
    devise.owner.DeviseToken
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the base class for all token contract operations

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
from devise.base import costs_gas, BaseDeviseClient

TOKEN_PRECISION = int(1e6)


class DeviseToken(BaseDeviseClient):
    """
    This is the base class for all token operations
    """

    @property
    def total_supply(self):
        """
        Returns the total supply of tokens
        """
        return self._token_contract.functions.totalSupply().call() / TOKEN_PRECISION

    @property
    def cap(self):
        """
        Returns the maximum possible supply for this token
        """
        return self._token_contract.functions.cap().call() / TOKEN_PRECISION

    def allowance(self, owner, spender):
        """
        Checks the amount of tokens that an owner allowed to a spender
        :param owner: the owner of the tokens
        :param spender: the authorized spender
        :return: The amount spender is allowed to spend
        """
        return self._token_contract.functions.allowance(owner, spender).call() / TOKEN_PRECISION

    def balance_of(self, address):
        """
        Returns the balance in tokens of the address provided
        :param address: the address for which we're querying the token blance
        """
        return self._token_contract.functions.balanceOf(address).call() / TOKEN_PRECISION

    @costs_gas
    def transfer(self, to_address, amount):
        """
        Transfer {amount} of tokens to {to_address}
        :param to_address: the intended recipient of the tokens
        :param amount: the number of tokens to transfer
        """
        assert len(to_address) == 42, "Invalid to_address parameter"
        assert 0 < amount <= self.balance_of(self.address), \
            "invalid amount specified, must be > 0 and less than or equal to token balance of current account!"

        micro_dvz_tokens = int(amount * TOKEN_PRECISION)
        return self._transact(self._token_contract.functions.transfer(to_address, micro_dvz_tokens),
                              {"from": self.address})

    @costs_gas
    def transfer_from(self, from_address, to_address, amount):
        """
        Transfer amount from from_address to to_address
        :param from_address: the account from which to take the tokens
        :param to_address: the intended recipient of the tokens
        :param amount: the number of tokens to transfer
        """
        assert len(from_address) == 42, "Invalid from_address parameter"
        assert len(to_address) == 42, "Invalid to_address parameter"
        assert 0 < amount <= self.balance_of(from_address), \
            "invalid amount specified, must be > 0 and <= the token balance of the from_address!"
        assert amount <= self.allowance(from_address, self.address), \
            "invalid amount specified, must be <= approved spending allowance"

        micro_dvz_tokens = int(amount * TOKEN_PRECISION)
        return self._transact(self._token_contract.functions.transferFrom(from_address, to_address, micro_dvz_tokens),
                              {"from": self.address})

    @costs_gas
    def approve(self, spender_address, amount):
        """
        Approve spender_address to transfer up to amount our of the current wallet
        :param spender_address: The address authorized to spend the amount of tokens specified
        :param amount: the max amount of tokens to be spent by spender_address
        """
        assert len(spender_address) == 42, "Invalid spender_address parameter"
        micro_dvz_amount = int(amount * TOKEN_PRECISION)
        return self._transact(self._token_contract.functions.approve(spender_address, micro_dvz_amount),
                              {"from": self.address})

    @costs_gas
    def increase_approval(self, spender_address, amount):
        """
        Increase the allownace of spender_address by the amount of tokens specified
        :param spender_address: The spender address
        :param amount: The amount of tokens to increase allowance by
        """
        assert len(spender_address) == 42, "Invalid spender_address parameter"
        micro_dvz_amount = int(amount * TOKEN_PRECISION)
        return self._transact(self._token_contract.functions.increaseApproval(spender_address, micro_dvz_amount),
                              {"from": self.address})

    @costs_gas
    def decrease_approval(self, spender_address, amount):
        """
        Decrease the allownace of spender_address by the amount of tokens specified
        :param spender_address: The spender address
        :param amount: The amount of tokens to decrease allowance by
        """
        assert len(spender_address) == 42, "Invalid spender_address parameter"
        micro_dvz_amount = int(amount * TOKEN_PRECISION)
        return self._transact(self._token_contract.functions.decreaseApproval(spender_address, micro_dvz_amount),
                              {"from": self.address})
