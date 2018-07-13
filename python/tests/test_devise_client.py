# -*- coding: utf-8 -*-
"""
    DeviseClient tests
    ~~~~~~~~~
    These are the DeviceClient tests. These assume you are running ganache or similar tool. Do not use on MainNet!
    For example, you can use ganache with the mnemonic "moment reform peace alter nominee you label idle license organ
    youth good", and in secure mode with --secure, and these tests should pass.

    To run these tests against your own deployed contracts, make sure you change the contract addresses in
     Devise/base.py to match what you deployed with truffle.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
import hashlib
import os
import tempfile
import uuid
from math import floor
from unittest import mock
from unittest.mock import call, MagicMock

import pytest
import sha3
from eth_account import Account
from pytest import raises
from web3 import Web3

from devise import DeviseClient
from devise.base import generate_account
from .utils import evm_snapshot, evm_revert, time_travel, TEST_KEYS


class TestDeviseClient(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, owner_client, client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.client)

    def test_get_signed_api_url(self, client):
        """Test that we can sign api urls using a local private key"""

        # sign a sample API request
        signed_url = client.get_signed_api_url(
            '/v1/devisechain/0055baf8939b9956dcae9175cbf0f5365cfd7348/weights')
        msg = '/v1/devisechain/0055baf8939b9956dcae9175cbf0f5365cfd7348/weights?address=' + client.address

        # Verify the signature is correct
        signature = signed_url.split('&signature=')[1]
        sign_msg = ("\x19Ethereum Signed Message:\n%s%s" % (len(msg), msg.lower())).encode('utf8')
        message_hash = sha3.keccak_256(sign_msg).hexdigest()
        account = Account()
        address = account.recoverHash(message_hash, signature=signature)
        assert address.lower() == client.address.lower()

    def test_buy_tokens(self, client):
        """Tests that we can buy Devise tokens with ethers using a local primary key"""

        old_tokens_balance = client.dvz_balance
        ether_amount = .5
        client.buy_eth_worth_of_tokens(ether_amount)
        currentRate = client._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = client.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    @pytest.mark.skipif(os.environ.get("JENKINS_BUILD", False), reason="Jenkins cannot create signed cloudfront urls!")
    def test_buy_tokens_ledger(self, client_ledger):
        """Tests that we can buy Devise tokens with Ledger nano s HD wallet"""
        if client_ledger is None:
            print('Skip this test!')
            return

        old_tokens_balance = client_ledger.dvz_balance
        ether_amount = .5
        client_ledger.buy_eth_worth_of_tokens(ether_amount)
        currentRate = client_ledger._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = client_ledger.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    @mock.patch('devise.base.getpass', return_value='password')
    def test_buy_tokens_keyfile(self, _, client_local_keyfile):
        """Tests that we can buy Devise tokens with ethers using a local encrypted key store file"""
        old_tokens_balance = client_local_keyfile.dvz_balance
        ether_amount = .5
        client_local_keyfile.buy_eth_worth_of_tokens(ether_amount)
        currentRate = client_local_keyfile._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = client_local_keyfile.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    def test_buy_tokens_keyfile_with_password(self):
        """Tests that we can buy Devise tokens with ethers using a local encrypted key store file"""
        key_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'key_file.json')
        client_local_keyfile = DeviseClient(key_file=key_path, password='password')
        old_tokens_balance = client_local_keyfile.dvz_balance
        ether_amount = .5
        client_local_keyfile.buy_eth_worth_of_tokens(ether_amount)
        currentRate = client_local_keyfile._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = client_local_keyfile.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    def test_provision_tokens(self, client):
        """Tests that we can send tokens to the clients contract using a local primary key"""
        tokens_amt = 500000
        rate = client._token_sale_contract.functions.getCurrentRate().call()
        ethers = (tokens_amt + 1) / rate
        client.buy_eth_worth_of_tokens(ethers=ethers)
        old_balance = client.dvz_balance

        client.provision(tokens_amt)
        allow = client.dvz_balance_escrow
        assert allow == tokens_amt
        new_token_balance = client.dvz_balance
        assert round(new_token_balance, 6) == round(old_balance - tokens_amt, 6)

    @mock.patch('devise.base.getpass', return_value='password')
    def test_provision_tokens_keyfile(self, _, client_local_keyfile):
        """Tests that we can send tokens to the clients contract using a local wallet and account"""

        client_local_keyfile.buy_eth_worth_of_tokens(ethers=.5)
        balance = client_local_keyfile.dvz_balance
        client_local_keyfile.provision(balance)
        new_allowance = client_local_keyfile.dvz_balance_escrow

        assert balance > 0
        assert new_allowance == balance

    @mock.patch('devise.base.getpass', return_value='password')
    def test_provision_keyfile(self, _, client_local_keyfile):
        """Tests converting ethers into Devise tokens and provisioning the clients account with a private key/remote node
        """
        client_local_keyfile.buy_eth_worth_of_tokens(ethers=.5)
        client_local_keyfile.provision(client_local_keyfile.dvz_balance)
        rate = client_local_keyfile._token_sale_contract.functions.getCurrentRate().call()
        assert floor(client_local_keyfile.dvz_balance_escrow) == floor(.5 * rate)

    def test_withdraw_can_withdraw(self, client):
        client.buy_eth_worth_of_tokens(ethers=.1)
        client.provision(client.dvz_balance)
        rate = client._token_sale_contract.functions.getCurrentRate().call()
        expected_bal = .1 * rate
        assert round(client.client_summary["dvz_balance_escrow"], 6) == round(expected_bal, 6)
        client.withdraw(expected_bal)
        assert client.client_summary["dvz_balance_escrow"] == 0

    def test_lease_all_updates_seats(self, client):
        client.buy_eth_worth_of_tokens(ethers=1)
        client.provision(client.dvz_balance)
        assert client.seats_available == 100
        client.lease_all(limit_price=10000, num_seats=10)
        assert client.seats_available == 90

    def test_lease_all_requires_enough_tokens(self, client):
        client.buy_eth_worth_of_tokens(ethers=.01)
        client.provision(client.dvz_balance)
        assert client.seats_available == 100
        client.lease_all(limit_price=10000, num_seats=10)
        assert client.seats_available == 90

    def test_account_summary(self, client):
        assert client.client_summary is None
        client.buy_eth_worth_of_tokens(ethers=100)
        rate = client._token_sale_contract.functions.getCurrentRate().call()
        escrow_bal = 100 * rate
        client.provision(escrow_bal)
        client.apply_for_power_user()
        client.request_historical_data_access()
        assert client.client_summary == {
            "client": client.address,
            "beneficiary": client.address,
            "dvz_balance_escrow": escrow_bal,
            "dvz_balance": client.dvz_balance,
            "last_term_paid": None,
            "power_user": True,
            "historical_data_access": True,
            "current_term_seats": 0,
            "indicative_next_term_seats": 0
        }

    def test_beneficiary(self, client):
        assert client.beneficiary == client.address
        client.designate_beneficiary('0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408')
        assert client.beneficiary == '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408'

    def test_is_power_user(self, client, owner_client):
        owner_client.set_power_user_fee(1)
        client.buy_eth_worth_of_tokens(ethers=100)
        client.provision(client.dvz_balance)
        assert not client.is_power_user
        client.apply_for_power_user()
        assert client.is_power_user

    def total_incremental_usefulness(self, client, master_node):
        assert client.total_incremental_usefulness == 0
        lepton_hash = hashlib.sha1('hello world 1'.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, 1.5123456789123456789)
        assert client.total_incremental_usefulness == 1.512345

    def test_get_all_leptons(self, master_node, client):
        """Tests that we can query all leptons from the smart contract"""
        leptons = client.get_all_leptons()
        new_lepton = 'hello world %s' % (len(leptons) + 1)
        lepton_hash = hashlib.sha1(new_lepton.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 0.5123456789123456789)

        new_leptons = client.get_all_leptons()
        assert len(new_leptons) == len(leptons) + 1
        assert new_leptons[-1] == {"hash": lepton_hash, "previous_hash": None, "incremental_usefulness": 0.512345}

    def test_get_all_renters(self, client):
        """Tests that we can query all current renter addresses from the smart contract"""
        client.buy_eth_worth_of_tokens(ethers=1)
        client.provision(client.dvz_balance)
        client.lease_all(10000, 10)
        balance = client.dvz_balance_escrow
        clients_list = client.get_all_renters()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': balance,
            'dvz_balance': 0.0,
            'last_term_paid': client.current_lease_term,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 10,
            'indicative_next_term_seats': 10
        }

        client.designate_beneficiary("0xd4a6B94E45B8c0185e33F210f4F96bDAe40aa22E")
        clients_list = client.get_all_renters()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xd4a6B94E45B8c0185e33F210f4F96bDAe40aa22E',
            'dvz_balance_escrow': balance,
            'dvz_balance': 0.0,
            'last_term_paid': client.current_lease_term,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 10,
            'indicative_next_term_seats': 10
        }

    def test_get_all_clients(self, client):
        client.buy_eth_worth_of_tokens(ethers=100)
        client.provision(client.dvz_balance)
        balance = client.dvz_balance_escrow
        clients_list = client.get_all_clients()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': balance,
            'dvz_balance': 0.0,
            'last_term_paid': None,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 0,
            'indicative_next_term_seats': 0
        }

        client.designate_beneficiary("0xd4a6B94E45B8c0185e33F210f4F96bDAe40aa22E")
        clients_list = client.get_all_clients()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xd4a6B94E45B8c0185e33F210f4F96bDAe40aa22E',
            'dvz_balance_escrow': balance,
            'dvz_balance': 0.0,
            'last_term_paid': None,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 0,
            'indicative_next_term_seats': 0
        }

    def test_rent_current_term(self, client, owner_client, master_node):
        master_node.add_lepton(hashlib.sha1("some lepton".encode('utf8')).hexdigest(), None, 1.5123456789123456789)
        assert client.rent_per_seat_current_term == 1512.345000
        time_travel(86400 * 31, client)
        assert client.rent_per_seat_current_term > 0

    def test_price_current_term(self, client):
        assert client.price_per_bit_current_term == 1000

    def test_indicative_rent_next_term(self, client, master_node):
        master_node.add_lepton(hashlib.sha1("some lepton".encode('utf8')).hexdigest(), None, 1.5123456789123456789)
        price_next_term = client.indicative_rent_per_seat_next_term
        assert price_next_term > 0

    def test_indicative_price_next_term(self, client, master_node):
        master_node.add_lepton(hashlib.sha1("some lepton".encode('utf8')).hexdigest(), None, 1.5123456789123456789)
        assert client.indicative_price_per_bit_next_term == 1000

    @mock.patch("devise.clients.api.RentalAPI.get_signed_api_url", return_value='')
    @mock.patch("devise.clients.api.RentalAPI._get_latest_weights_date_from_contents", return_value='20180608')
    def test_download_latest_weights(self, _get_date_mock, signed_url_mock, client):
        file_name = client.download_latest_weights()
        assert os.path.exists(file_name)
        try:
            assert signed_url_mock.call_count == 1
            url = signed_url_mock.call_args[0][0]
            assert url == '/v1/devisechain/latest_weights'
            assert file_name == 'devise_latest_weights_20180608.zip'
        finally:
            os.unlink(file_name)

    @mock.patch("devise.clients.api.RentalAPI._download")
    def test_download_historical_weights(self, download_mock, client):
        client.download_historical_weights()
        assert download_mock.call_count == 1
        url = download_mock.call_args[0][0]
        file_name = download_mock.call_args[0][1]
        assert url.startswith(
            'https://api.devisechain.io/v1/devisechain/historical_weights?address=%s&signature=' % client.address)
        assert file_name == 'devise_historical_weights.tar'

    @mock.patch("devise.clients.api.RentalAPI._download")
    def test_download_historical_returns(self, download_mock, client):
        client.download_historical_returns()
        assert download_mock.call_count == 1
        url = download_mock.call_args[0][0]
        file_name = download_mock.call_args[0][1]
        assert url.startswith(
            'https://api.devisechain.io/v1/devisechain/historical_returns?address=%s&signature=' % client.address)
        assert file_name == 'devise_historical_returns.tar'

    def test__download(self, client):
        """Test that the internal download function works"""
        file_name = uuid.uuid4().hex + '.zip'
        file_path = os.path.join(tempfile.gettempdir(), file_name)
        try:
            client._download('https://www.pit.ai', file_path)
            assert os.path.exists(file_path)
            assert os.stat(file_path).st_size > 1000
        finally:
            os.unlink(file_path)

    def test_get_all_bidders(self, client, master_node):
        """Tests that we can get all the bids in the price auction"""
        # Add leptons
        lepton_hash = hashlib.sha1('hello world 1'.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 1.5123456789123456789)

        # client 1 buys and provisions tokens
        client.buy_eth_worth_of_tokens(2)
        client.provision(16000)
        assert client.get_all_bidders() == []

        # client 1 leases the blockchain
        lease_prc = 1000
        client.lease_all(lease_prc, 1)
        assert client.get_all_bidders() == [
            {'address': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408', 'limit_price': lease_prc,
             'requested_seats': 1}]
        assert client.get_all_bidders(active=True) == [
            {'address': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408', 'limit_price': lease_prc,
             'requested_seats': 1}]

        # Add another bidder leases the blockchain
        client2 = DeviseClient(private_key=TEST_KEYS[2])
        client2.buy_eth_worth_of_tokens(2)
        client2.provision(16000)
        client2.lease_all(lease_prc + 1, 1)
        assert client.get_all_bidders(active=True) == [
            {'address': client.w3.eth.accounts[2], 'limit_price': lease_prc + 1, 'requested_seats': 1},
            {'address': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408', 'limit_price': lease_prc, 'requested_seats': 1}]

        # client 2 escrow balances drops below bid price, no longer active
        client2.withdraw(client2.dvz_balance_escrow)
        assert client.get_all_bidders(active=True) == [
            {'address': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408', 'limit_price': lease_prc, 'requested_seats': 1}]

    def test_lease_all_seats(self, client, master_node):
        lepton_hash = hashlib.sha1('hello world 1'.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 1.5123456789123456789)

        # Buy enough tokens for 1 term
        currentRate = client._token_sale_contract.functions.getCurrentRate().call()
        client.buy_eth_worth_of_tokens(ethers=(15500 / currentRate))
        client.provision(client.dvz_balance)
        assert client.seats_available == 100

        # lease all, 10 seats
        client.lease_all(limit_price=1000, num_seats=10)
        assert client.seats_available == 90
        assert client.current_term_seats == 10
        assert client.next_term_seats == 0

        # provision enough tokens for next term auction
        client.buy_eth_worth_of_tokens(ethers=(15500 / currentRate))
        client.provision(client.dvz_balance)
        assert client.next_term_seats == 10
        client.cancel_bid()
        assert client.next_term_seats == 0

    def test_eth_balance(self, client):
        bal = self.client.eth_balance
        assert bal > 100000

    @mock.patch('devise.base.getpass', return_value='password')
    def test_create_account(self, _):
        file_path, address = generate_account()
        assert os.path.exists(file_path)
        assert len(address) == 42
        assert Web3.toChecksumAddress(address) == address
        assert file_path.endswith(address.lower() + '.json')
        client = DeviseClient(account=address)
        assert client._scan_for_keystore_file(address) == file_path

    @mock.patch('devise.base.getpass', return_value='password')
    def test_create_beneficiary(self, _, client):
        [ret, addr] = client.create_beneficiary()
        assert ret == True
        ben = client.beneficiary
        assert addr == ben

    @mock.patch('devise.base.LedgerWallet')
    def test_buy_tokens_ledger_mock(self, ledger_mock):
        """Tests that we can buy Devise tokens with Ledger nano s HD wallet"""
        test_client_account = "0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408"
        ledger = DeviseClient(account=test_client_account, auth_type='ledger')
        old_tokens_balance = ledger.dvz_balance
        ether_amount = .5
        vrs = (
            28,
            2182719146884808318922065288388701482638595064358707342427872633327257261733,
            46015294558581125017244029788985539581305398667308472361832920130849890183038)

        ledger_mock().sign.return_value = vrs
        ledger_mock().get_account_index.return_value = 0
        ledger.w3.eth.estimateGas = MagicMock(return_value=400000)
        ledger.w3.eth.generateGasPrice = MagicMock(return_value=100000000000)
        ledger.buy_eth_worth_of_tokens(ether_amount)

        assert ledger_mock().get_account_index.call_count == 1
        ledger_mock().get_account_index.assert_has_calls([call(test_client_account)])

        assert ledger_mock().sign.call_count == 1
        ledger_mock().sign.assert_has_calls([call(
            b"\xea\x80\x85\x17Hv\xe8\x00\x83\x07\xa1 \x94\t\x87\xee'By\xc6pu5\xfa\xee\x0e!5\x85\x7f<2\x91\x88\x06\xf0[Y\xd3\xb2\x00\x00\x80",
            account_index=0)])

        currentRate = ledger._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = ledger.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    @pytest.mark.skipif(os.environ.get("JENKINS_BUILD", False),
                        reason="Jenkins cannot access a ledger hardware wallet!")
    def test_buy_tokens_ledger(self, client_ledger):
        """Tests that we can buy Devise tokens with Ledger nano s HD wallet"""

        if client_ledger is None:
            pytest.skip('Ledger nano dongle not found!')

        old_tokens_balance = client_ledger.dvz_balance
        ether_amount = .5
        client_ledger.buy_eth_worth_of_tokens(ether_amount)
        currentRate = client_ledger._token_sale_contract.functions.getCurrentRate().call()
        new_tokens_balance = client_ledger.dvz_balance
        tokens_purchased = ether_amount * currentRate

        assert new_tokens_balance == old_tokens_balance + tokens_purchased

    def test_client_call_only(self, client):
        blank_client = DeviseClient()
        assert blank_client.price_per_bit_current_term == client.price_per_bit_current_term
        assert blank_client.rent_per_seat_current_term == client.rent_per_seat_current_term
        assert blank_client.indicative_rent_per_seat_next_term == client.indicative_rent_per_seat_next_term
        assert blank_client.total_incremental_usefulness == client.total_incremental_usefulness
        with raises(ValueError):
            blank_client.buy_tokens(1000)

    def test_transfer_ether(self, client):
        client2 = DeviseClient(private_key=TEST_KEYS[2])
        prev_bal_recipient = client2.eth_balance
        client.transfer_ether(client2.address, 1)
        assert client2.eth_balance == prev_bal_recipient + 1

    def test_get_client_address(self, client):
        # current client is not a money account => never provisioned
        assert client.get_client_address(client.address) is None
        client.buy_tokens(100000)
        client.provision(100000)
        # client is not a current renter
        assert client.client_summary["current_term_seats"] == 0
        # current client is now a money account
        assert client.get_client_address(client.address) == client.address
        # getting the money account for a beneficiary works
        client.designate_beneficiary(client.w3.eth.accounts[2])
        assert client.get_client_address(client.w3.eth.accounts[2]) == client.address
        assert client.get_client_address(client.address) == client.address
        # once again from the DeviseClient of the beneficiary
        client_beneficiary = DeviseClient(private_key=TEST_KEYS[2])
        assert client_beneficiary.get_client_address(client_beneficiary.address) == client.address
