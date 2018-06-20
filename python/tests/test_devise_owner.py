# -*- coding: utf-8 -*-
"""
    DeviseOwner tests
    ~~~~~~~~~
    These are the DeviseOwnser tests. These assume you are running ganache or similar tool. Do not use on MainNet!
    For example, you can use ganache with the mnemonic "moment reform peace alter nominee you label idle license organ
    youth good", and in secure mode with --secure, and these tests should pass.

    To run these tests against your own deployed contracts, make sure you change the contract addresses in
     Devise/base.py to match what you deployed with truffle.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""

import pytest

from .utils import evm_snapshot, evm_revert


class TestDeviseOwner(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, owner_client, client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.client)

    def test_set_power_user_fee(self, owner_client, client):
        owner_client.set_power_user_fee(5000)
        client.buy_eth_worth_of_tokens(ethers=100)
        client.provision(client.dvz_balance)
        token_bal = client.dvz_balance_escrow
        client.apply_for_power_user()
        assert client.client_summary == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': token_bal - 5000,
            'dvz_balance': 0.0,
            'last_term_paid': None,
            'power_user': True,
            'historical_data_access': False,
            'current_term_seats': 0,
            'indicative_next_term_seats': 0
        }

    def test_set_historical_data_fee(self, owner_client, client):
        owner_client.set_historical_data_fee(5000)
        client.buy_eth_worth_of_tokens(ethers=100)
        client.provision(client.dvz_balance)
        token_bal = client.dvz_balance_escrow
        client.request_historical_data_access()
        assert client.client_summary == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': token_bal - 5000,
            'dvz_balance': 0.0,
            'last_term_paid': None,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 0,
            'indicative_next_term_seats': 0
        }
