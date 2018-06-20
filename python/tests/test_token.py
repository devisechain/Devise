# -*- coding: utf-8 -*-
"""
    Token tests
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

from devise.clients.token import DeviseToken
from .utils import evm_snapshot, evm_revert, TEST_KEYS


class TestToken(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, token_client):
        self.token_client = token_client
        self.snapshot_id = evm_snapshot(token_client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.token_client)

    def test_total_supply(self, token_client):
        assert token_client.total_supply == 1e9

    def test_balance_of(self, token_client):
        assert token_client.balance_of(token_client.w3.eth.accounts[2]) == 1e9

    def test_cap(self, token_client):
        assert token_client.cap == 10e9

    def test_approve_allowance(self, token_client):
        approved_address = token_client.w3.eth.accounts[1]
        token_client.approve(approved_address, 12345)
        assert token_client.allowance(token_client.address, approved_address) == 12345

        token_client.approve(approved_address, 0)
        assert token_client.allowance(token_client.address, approved_address) == 0

    def test_transfer(self, token_wallet_client, token_client):
        # Start with some spending money from the token wallet
        assert token_client.balance_of(token_client.address) == 0
        token_wallet_client.transfer(token_client.address, 1)
        assert token_client.balance_of(token_client.address) == 1

        # Send using the regular account
        recipient_address = token_client.w3.eth.accounts[1]
        prev_bal = token_client.balance_of(recipient_address)
        token_client.transfer(recipient_address, 1)
        assert token_client.balance_of(recipient_address) == prev_bal + 1

        # We don't have enough funds for this transfer, should raise an error
        with raises(AssertionError):
            token_client.transfer(recipient_address, 1)

    def test_transfer_from(self, token_wallet_client, token_client):
        # Start with some spending money from the token wallet
        assert token_client.balance_of(token_client.address) == 0
        token_wallet_client.transfer(token_client.address, 12345)
        assert token_client.balance_of(token_client.address) == 12345

        approved_address = token_client.w3.eth.accounts[1]
        token_client.approve(approved_address, 12345)
        approved_client = DeviseToken(private_key=TEST_KEYS[1])
        approved_client.transfer_from(token_client.address, approved_address, 12345)
        assert token_client.balance_of(approved_address) == 12345
        assert token_client.allowance(token_client.address, approved_address) == 0

        # Reached allowance, should fail
        with raises(Exception):
            approved_client.transfer_from(token_client.address, approved_address, 1)

    def test_increase_approval(self, token_client):
        approved_address = token_client.w3.eth.accounts[1]
        token_client.approve(approved_address, 12345)
        assert token_client.allowance(token_client.address, approved_address) == 12345
        token_client.increase_approval(approved_address, 1)
        assert token_client.allowance(token_client.address, approved_address) == 12346

    def test_decrease_approval(self, token_client):
        approved_address = token_client.w3.eth.accounts[1]
        token_client.approve(approved_address, 12345)
        assert token_client.allowance(token_client.address, approved_address) == 12345
        token_client.decrease_approval(approved_address, 1)
        assert token_client.allowance(token_client.address, approved_address) == 12344
        token_client.decrease_approval(approved_address, 150000)
        assert token_client.allowance(token_client.address, approved_address) == 0

    def test_reset_approval(self, token_client, token_wallet_client):
        # Start with some spending money from the token wallet
        assert token_client.balance_of(token_client.address) == 0
        token_wallet_client.transfer(token_client.address, 12345 * 2)
        assert token_client.balance_of(token_client.address) == 24690

        # Approve a client to spend up to 12345
        approved_address = token_client.w3.eth.accounts[1]
        token_client.approve(approved_address, 12345)
        assert token_client.allowance(token_client.address, approved_address) == 12345

        # Client spends some money, allowance goes down
        client = DeviseToken(private_key=TEST_KEYS[1])
        client.transfer_from(token_client.address, client.address, 12340)
        assert token_client.allowance(token_client.address, approved_address) == 5

        # client has insufficient allowance
        with raises(AssertionError):
            client.transfer_from(token_client.address, client.address, 10)

        # reset client allowance
        token_client.approve(approved_address, 12345)
        assert token_client.allowance(token_client.address, approved_address) == 12345
        client.transfer_from(token_client.address, client.address, 100)
        assert token_client.allowance(token_client.address, approved_address) == 12245
