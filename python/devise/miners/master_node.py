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

    def add_lepton(self, lepton_hash, previous_lepton_hash, incremental_usefulness, gas_price=None):
        """
        Add a new lepton to the block chain (for example when a miner finds a lepton and it passes the proof)
        :param lepton_hash the lepton hash to add
        :param previous_lepton_hash the lepton hash to of the previous lepton in the chain
        :param incremental_usefulness the incremental usefulness of the new lepton
        :param gas_price the gas price to use for this transaction
        :return: the transaction receipt
        """
        # Make sure we are running this as the owner of the clients contract
        assert self.account in self.get_master_nodes(), "address %s is not a master node!" % self.account
        # Convert the iu to int based on our precision setting
        contract_iu = int(incremental_usefulness * IU_PRECISION)
        # validate the hashes
        assert len(lepton_hash) == 40, "lepton_hash must be a sha1 hash encoded as a 40 character hex string"
        assert previous_lepton_hash is None or len(
            previous_lepton_hash) == 40, "previous_lepton_hash must be a sha1 hash encoded as a 40 character hex string"
        if previous_lepton_hash is None:
            previous_lepton_hash = '00'
        # Build a transaction dictionary with the optional gas_price and nonce
        transaction = {"from": self.account}
        if gas_price is not None:
            transaction["gasPrice"] = gas_price
        # execute transaction
        return self._transact(self._rental_contract.functions.addLepton(
            bytes.fromhex(lepton_hash), bytes.fromhex(previous_lepton_hash), contract_iu), transaction)

    def get_master_nodes(self):
        """returns a list of all authorized master nodes"""
        return self._rental_contract.functions.getMasterNodes().call()
