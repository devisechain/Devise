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
    def setup_method(self, owner_client, client, token_wallet_client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)
        # TODO Remove this and replace with real provisioning with ether in the tests
        token_wallet_client.transfer(client.address, 10000000)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.client)

    def test_set_power_user_fee(self, owner_client, client):
        owner_client.set_power_user_fee(5000)
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

    def test_get_escrow_history(self, owner_client):
        escrow_hist = owner_client.get_escrow_history()
        assert escrow_hist == ['0x93c86A7574a1E5eAF773B807fFF3496728f5B1BC']

    def test_get_revenue_history(self, owner_client):
        rev_hist = owner_client.get_revenue_history()
        assert rev_hist == ['0x5c7Fe1B9bad324c5c8B90f66243B45F65B3f5fcd']

    def test_implementation(self, owner_client):
        impl = owner_client.implementation
        assert impl == '0x5a1e6BC336D5d19E0ADfaa6A1826CF39A55315bA'

    def test_impl_version(self, owner_client):
        ver = owner_client.impl_version
        assert ver == 1

    def test_get_all_implementations(self, owner_client):
        history = owner_client.get_all_implementations()
        assert history == [{"impl": '0x5a1e6BC336D5d19E0ADfaa6A1826CF39A55315bA', "ver": 1}]

    def test_get_rate_setter(self, owner_client):
        rate_setter = owner_client.get_rate_setter()
        assert rate_setter == '0x0000000000000000000000000000000000000000'

    def test_add_rate_setter(self, owner_client, client):
        rate_setter = client.address
        ret = owner_client.add_rate_setter(rate_setter)
        assert ret == True

    def test_remove_rate_setter(self, owner_client, client):
        owner_client.add_rate_setter(client.address)
        owner_client.remove_rate_setter(client.address)
        with pytest.raises(Exception):
            owner_client.get_rate_setter(0)

    def test_set_eth_usd_rate(self, owner_client, rate_setter, client):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        rate = client.eth_usd_rate
        assert rate > 100

    def test_log_file_created(self, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        hash = '38a1e8a65521791b9d34cd62fac36ceb5349bb6c'
        tx = rate_setter.log_file_created(hash)
        assert tx is True
        with pytest.raises(AssertionError):
            hash = '0x38a1e8a65521791b9d34cd62fac36ceb5349bb6c'
            rate_setter.log_file_created(hash)
