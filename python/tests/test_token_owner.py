# -*- coding: utf-8 -*-
"""
    Token owner tests
    ~~~~~~~~~
    These are the token tests. These assume you are running ganache or similar tool. Do not use on MainNet!
    For example, you can use ganache with the mnemonic "moment reform peace alter nominee you label idle license organ
    youth good", and in secure mode with --secure, and these tests should pass.

    To run these tests against your own deployed contracts, make sure you change the contract addresses in
     Devise/base.py to match what you deployed with truffle.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""

import pytest
from pytest import raises

from devise.owner.token_owner import DeviseTokenOwner
from .utils import evm_snapshot, evm_revert, TEST_KEYS


class TestTokenOwner(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, owner_client, client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.client)

    def test_mint(self, token_owner_client):
        token_wallet_account = token_owner_client.w3.eth.accounts[0]
        # Can't mint more than cap
        with raises(AssertionError):
            assert token_owner_client.mint(token_wallet_account, token_owner_client.cap + 1)

        # Minting credits the recipient address with the right amount
        assert token_owner_client.total_supply == 1e9
        token_owner_client.mint(token_wallet_account, 1000)
        assert token_owner_client.total_supply == 1e9 + 1000
        assert token_owner_client.balance_of(token_owner_client.address) == 0
        assert token_owner_client.balance_of(token_wallet_account) == 1000

    def test_add_minter(self, token_owner_client, token_client):
        with raises(ValueError):
            DeviseTokenOwner(account=token_client.address, password='password').mint(token_client.address, 1000)

        token_owner_client.add_minter(token_client.address)
        DeviseTokenOwner(private_key=TEST_KEYS[1]).mint(token_client.address, 1000)
        assert token_client.balance_of(token_client.address) == 1000

    def test_remove_minter(self, token_owner_client, token_client):
        token_owner_client.add_minter(token_client.address)
        DeviseTokenOwner(private_key=TEST_KEYS[1]).mint(token_client.address, 1000)
        assert token_client.balance_of(token_client.address) == 1000

        token_owner_client.remove_minter(token_client.address)
        with raises(ValueError):
            DeviseTokenOwner(account=token_client.address, password='password').mint(token_client.address, 1000)

    def test_get_minters(self, token_owner_client, token_client):
        token_owner_client.add_minter(token_client.address)
        minters = token_owner_client.get_minters()
        assert len(minters) == 2
        assert minters[0] == token_owner_client.address
