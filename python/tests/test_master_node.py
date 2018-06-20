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

from .utils import evm_snapshot, evm_revert


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
        strats = client.get_all_leptons()
        new_strat = 'hello world %s' % (len(strats) + 1)
        lepton1_hash = hashlib.sha1(new_strat.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton1_hash, 0.5123456789123456789)

        new_strats = client.get_all_leptons()
        assert len(new_strats) == len(strats) + 1
        assert new_strats[-1] == {"hash": lepton1_hash, "previous_hash": None, "incremental_usefulness": 0.512345}

        new_strat = 'hello world 2 %s' % (len(strats) + 1)
        lepton2_hash = hashlib.sha1(new_strat.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton2_hash, 0.5123456789123456789)
        new_strats = client.get_all_leptons()
        assert len(new_strats) == len(strats) + 2
        assert new_strats[-1] == {"hash": lepton2_hash, "previous_hash": lepton1_hash,
                                  "incremental_usefulness": 0.512345}

    def test_buy_tokens_error(self, master_node, client):
        strats = client.get_all_leptons()
        new_strat = 'hello world %s' % (len(strats) + 1)
        lepton_hash = hashlib.sha1(new_strat.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, 0.5123456789123456789)
        with raises(ValueError):
            client.buy_tokens(200)

    def test_buy_tokens(self, master_node, client):
        strats = client.get_all_leptons()
        new_strat = 'hello world %s' % (len(strats) + 1)
        lepton_hash = hashlib.sha1(new_strat.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, 0.5123456789123456789)
        ret = client.buy_tokens(2000)
        assert ret == True
