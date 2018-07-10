# -*- coding: utf-8 -*-
"""
    MasterNode tests
    ~~~~~~~~~
    These are the MasterNode tests. These assume you are running ganache or similar tool. Do not use on MainNet!
    For example, you can use ganache with the mnemonic "moment reform peace alter nominee you label idle license organ
    youth good", and in secure mode with --secure, and these tests should pass.

    To run these tests against your own deployed contracts, make sure you change the contract addresses in
     Devise/base.py to match what you deployed with truffle.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
import hashlib

import pytest
from pytest import raises

from devise import MasterNode
from .utils import evm_snapshot, evm_revert, TEST_KEYS


class TestMasterNode(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, owner_client, client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.client)

    def test_add_lepton(self, master_node, client):
        """Tests that we can add leptons as the owner"""
        leptons = client.get_all_leptons()
        new_lepton = 'hello world %s' % (len(leptons) + 1)
        lepton1_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton1_hash, None, 0.5123456789123456789)

        new_leptons = client.get_all_leptons()
        assert len(new_leptons) == len(leptons) + 1
        assert new_leptons[-1] == {"hash": lepton1_hash, "previous_hash": None, "incremental_usefulness": 0.512345}

        new_lepton = 'hello world 2 %s' % (len(leptons) + 1)
        lepton2_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton2_hash, lepton1_hash, 0.5123456789123456789)
        new_leptons = client.get_all_leptons()
        assert len(new_leptons) == len(leptons) + 2
        assert new_leptons[-1] == {"hash": lepton2_hash, "previous_hash": lepton1_hash,
                                   "incremental_usefulness": 0.512345}

    def test_buy_tokens_error(self, master_node, client):
        leptons = client.get_all_leptons()
        new_lepton = 'hello world %s' % (len(leptons) + 1)
        lepton_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)
        with raises(ValueError):
            client.buy_tokens(200)

    def test_buy_tokens(self, master_node, client):
        leptons = client.get_all_leptons()
        new_lepton = 'hello world %s' % (len(leptons) + 1)
        lepton_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)
        ret = client.buy_tokens(2000)
        assert ret == True

    def test_add_master_node(self, owner_client, client):
        master_node = MasterNode(private_key=TEST_KEYS[2])
        new_lepton = 'hello world 1'
        lepton_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        # Not everyone can add leptons
        with pytest.raises(Exception):
            master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)
        num_leptons = len(client.get_all_leptons())
        # make this address a master node
        owner_client.add_master_node(master_node.address)
        assert master_node.address in owner_client.get_master_nodes()
        # Add a lepton as the new master node
        master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)
        new_leptons = client.get_all_leptons()
        assert len(new_leptons) == num_leptons + 1
        assert new_leptons[-1] == {"hash": lepton_hash, "previous_hash": None,
                                   "incremental_usefulness": 0.512345}

        # more than one master node can add leptons:
        master_node2 = MasterNode(private_key=TEST_KEYS[3])
        assert master_node2.address not in owner_client.get_master_nodes()
        owner_client.add_master_node(master_node2.address)
        lepton_hash2 = hashlib.sha1("hello world 2".encode('utf8')).hexdigest()
        lepton_hash3 = hashlib.sha1("hello world 3".encode('utf8')).hexdigest()
        master_node2.add_lepton(lepton_hash2, lepton_hash, 0.5123456789123456789)
        master_node.add_lepton(lepton_hash3, lepton_hash2, 0.5123456789123456789)
        new_leptons = client.get_all_leptons()
        assert len(new_leptons) == 3
        assert new_leptons[-1] == {"hash": lepton_hash3, "previous_hash": lepton_hash2,
                                   "incremental_usefulness": 0.512345}

    def test_remove_master_node(self, owner_client):
        master_node = MasterNode(private_key=TEST_KEYS[2])
        new_lepton = 'hello world 1'
        lepton_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()

        # Add a master node
        owner_client.add_master_node(master_node.address)
        assert master_node.address in owner_client.get_master_nodes()
        # remove the master node
        owner_client.remove_master_node(master_node.address)
        assert master_node.address not in owner_client.get_master_nodes()

        # Not everyone can add leptons
        with pytest.raises(Exception):
            master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)
