# -*- coding: utf-8 -*-
"""
    devise.miners.MasterNode
    ~~~~~~~~~
    This is the wrapper around all the master node smart contract operations. This wrapper connects to an Ethereum
    node and facilitates smart contract operations such as adding leptons to the blockchain.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""

from devise.base import IU_PRECISION, BaseDeviseClient


class MasterNode(BaseDeviseClient):
    """
    Wrapper class around Master Node smart contract operations. For example: adding leptons to the blockchain
    """

    def add_lepton(self, lepton_hash, incremental_usefulness):
        """
        Add a new lepton to the block chain (for example when a miner finds a lepton and it passes the proof)
        :param lepton_hash the lepton hash to add
        :param incremental_usefulness the incremental usefulness of the new lepton
        :return: the transaction receipt
        """
        # Make sure we are running this as the owner of the clients contract
        assert self._rental_contract.functions.owner().call() == self.account
        # Convert the iu to int based on our precision setting
        contract_iu = int(incremental_usefulness * IU_PRECISION)
        # Call the contract's addStrategy
        return self._transact(self._rental_contract.functions.addStrategy(lepton_hash, contract_iu),
                              {"from": self.account})
