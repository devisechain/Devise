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
from datetime import datetime
from unittest import mock

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
    def setup_method(self, owner_client, client, token_wallet_client):
        self.client = client
        _ = owner_client
        self.snapshot_id = evm_snapshot(client)
        # TODO Remove this and replace with real provisioning with ether in the tests
        token_wallet_client.transfer(client.address, 10000000)

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

    def test_provision_tokens(self, client):
        """Tests that we can send tokens to the clients contract using a local primary key"""
        tokens_amt = 500000
        old_balance = client.dvz_balance
        client.provision(tokens_amt)
        allow = client.dvz_balance_escrow
        assert allow == tokens_amt
        new_token_balance = client.dvz_balance
        assert round(new_token_balance, 6) == round(old_balance - tokens_amt, 6)

    @mock.patch('devise.owner.DeviseOwner._get_eth_usd_price', return_value='201.56000000')
    def test_provision_with_ether(self, _, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        client.provision_with_ether(1)
        allow = client.dvz_balance_escrow
        assert allow == 2015.6

    @mock.patch('devise.owner.DeviseOwner._get_eth_usd_price', return_value='201.56000000')
    def test_fund_account_ether(self, _, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        client.fund_account(amount=1, source='ETH', unit='ETH')
        allow = client.dvz_balance_escrow
        assert allow == 2015.6

    @mock.patch('devise.owner.DeviseOwner._get_eth_usd_price', return_value='201.56000000')
    def test_fund_account_ether_usd(self, _, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        client.fund_account(amount=201.56, source='ETH', unit='USD')
        allow = client.dvz_balance_escrow
        assert allow == 2015.6

    @mock.patch('devise.owner.DeviseOwner._get_eth_usd_price', return_value='201.56000000')
    def test_fund_account_ether_dvz(self, _, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        client.fund_account(amount=2015.6, source='ETH', unit='DVZ')
        allow = client.dvz_balance_escrow
        assert allow == 2015.6

    def test_fund_account(self, client):
        with pytest.raises(TypeError):
            client.fund_account()
        with pytest.raises(AssertionError):
            client.fund_account(amount=1000, unit='GBP', source='ETH')

    def test_fund_account_token(self, client):
        client.fund_account(amount=1000, unit='DVZ', source='DVZ')
        allow = client.dvz_balance_escrow
        assert allow == 1000

    def test_fund_account_token_usd(self, client):
        client.fund_account(amount=100, unit='USD', source='DVZ')
        allow = client.dvz_balance_escrow
        assert allow == 1000

    @mock.patch('devise.owner.DeviseOwner._get_eth_usd_price', return_value='100.00000000')
    def test_fund_account_token_eth(self, _, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        rate_setter.set_eth_usd_rate()
        client.fund_account(amount=1, unit='ETH', source='DVZ')
        allow = client.dvz_balance_escrow
        assert allow == 1000

    @mock.patch('devise.base.getpass', return_value='password')
    def test_provision_tokens_keyfile(self, _, client_local_keyfile):
        """Tests that we can send tokens to the clients contract using a local wallet and account"""

        client_local_keyfile.provision(1000000)
        new_allowance = client_local_keyfile.dvz_balance_escrow
        assert new_allowance == 1000000

    @mock.patch('devise.base.getpass', return_value='password')
    def test_provision_keyfile(self, _, client_local_keyfile):
        """Tests converting ethers into Devise tokens and provisioning the clients account with a private key/remote node
        """
        client_local_keyfile.provision(1000000)
        assert client_local_keyfile.dvz_balance_escrow == 1000000

    def test_withdraw_can_withdraw(self, client):
        client.provision(1000000)
        assert round(client.client_summary["dvz_balance_escrow"], 6) == round(1000000, 6)
        client.withdraw(1000000)
        assert client.client_summary["dvz_balance_escrow"] == 0

    def test_lease_all_updates_seats(self, client):
        client.provision(1000000)
        assert client.seats_available == 100
        client.lease_all(limit_price=10000, num_seats=10)
        assert client.seats_available == 90

    def test_lease_all_requires_enough_tokens(self, client):
        client.provision(1000000)
        assert client.seats_available == 100
        client.lease_all(limit_price=10000, num_seats=10)
        assert client.seats_available == 90

    def test_account_summary(self, client):
        assert client.client_summary is None
        client.provision(1000000)
        client.apply_for_power_user()
        client.request_historical_data_access()
        assert client.client_summary == {
            "client": client.address,
            "beneficiary": client.address,
            "dvz_balance_escrow": 1000000,
            "dvz_balance": 9000000,
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
        client.provision(1000000)
        assert not client.is_power_user
        client.apply_for_power_user()
        assert client.is_power_user

    def test_total_incremental_usefulness(self, client, master_node):
        assert client.total_incremental_usefulness == 0
        lepton_hash = hashlib.sha1('hello world 1'.encode('utf8')).hexdigest()
        master_node.add_lepton(lepton_hash, None, 1.5123456789123456789)
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
        client.provision(1000000)
        client.lease_all(10000, 10)
        balance = client.dvz_balance_escrow
        clients_list = client.get_all_renters()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': balance,
            'dvz_balance': 9000000.0,
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
            'dvz_balance': 9000000.0,
            'last_term_paid': client.current_lease_term,
            'power_user': True,
            'historical_data_access': True,
            'current_term_seats': 10,
            'indicative_next_term_seats': 10
        }

    def test_get_all_clients(self, client):
        client.provision(1000000)
        balance = client.dvz_balance_escrow
        clients_list = client.get_all_clients()
        assert clients_list[0] == {
            'client': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'beneficiary': '0xA1C2684B68A98c9636FC22F3B4E4332eF35A2408',
            'dvz_balance_escrow': balance,
            'dvz_balance': 9000000.0,
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
            'dvz_balance': 9000000.0,
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

    @mock.patch("devise.clients.api.RentalAPI.get_signed_api_url", return_value='')
    @mock.patch("devise.clients.api.RentalAPI._get_latest_weights_date_from_contents", return_value='20180608')
    def test_download_weights_by_hash(self, _get_date_mock, signed_url_mock, client):
        hash = "6e77f09a1f837d54726a9175fea227695c9c1a18"
        file_name = client.download_weights_by_hash(hash)
        assert os.path.exists(file_name)
        try:
            assert signed_url_mock.call_count == 1
            url = signed_url_mock.call_args[0][0]
            assert url == '/v1/devisechain/hashes/6e77f09a1f837d54726a9175fea227695c9c1a18'
            assert file_name == 'weights_by_hash_20180608.zip'
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
        client.provision(15500)
        assert client.seats_available == 100

        # lease all, 10 seats
        client.lease_all(limit_price=1000, num_seats=10)
        assert client.seats_available == 90
        assert client.current_term_seats == 10
        assert client.next_term_seats == 0

        # provision enough tokens for next term auction
        client.provision(1000000)
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
        assert ret is True
        ben = client.beneficiary
        assert addr == ben

    def test_client_call_only(self, client):
        blank_client = DeviseClient()
        assert blank_client.price_per_bit_current_term == client.price_per_bit_current_term
        assert blank_client.rent_per_seat_current_term == client.rent_per_seat_current_term
        assert blank_client.indicative_rent_per_seat_next_term == client.indicative_rent_per_seat_next_term
        assert blank_client.total_incremental_usefulness == client.total_incremental_usefulness
        with raises(AssertionError):
            blank_client.provision(1000)

    def test_transfer_ether(self, client):
        client2 = DeviseClient(private_key=TEST_KEYS[2])
        prev_bal_recipient = client2.eth_balance
        client.transfer_ether(client2.address, 1)
        assert client2.eth_balance == prev_bal_recipient + 1

    def test_get_client_address(self, client):
        # current client is not a money account => never provisioned
        assert client.get_client_address(client.address) is None
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

    def test_eth_usd_rate(self, client):
        rate = client.eth_usd_rate
        assert rate == 0

    def test_eth_dvz_rate(self, client):
        rate = client.eth_dvz_rate
        assert rate == 0

    def test_provision_on_behalf_of(self, client):
        recipient_client = DeviseClient(private_key=TEST_KEYS[2])
        sender_dvz_bal = client.dvz_balance
        prev_bal = recipient_client.dvz_balance
        client.provision_on_behalf_of(recipient_client.address, 1000)
        assert client.address != recipient_client.address
        assert recipient_client.dvz_balance_escrow == 1000
        assert recipient_client.dvz_balance == prev_bal
        assert client.dvz_balance == sender_dvz_bal - 1000

        client.provision_on_behalf_of(recipient_client.address, 1)
        assert recipient_client.dvz_balance_escrow == 1001
        assert client.dvz_balance == sender_dvz_bal - 1001
        assert recipient_client.client_summary == {
            'beneficiary': recipient_client.address,
            'client': recipient_client.address,
            'current_term_seats': 0,
            'dvz_balance': prev_bal,
            'dvz_balance_escrow': 1001.0,
            'historical_data_access': True,
            'indicative_next_term_seats': 0,
            'last_term_paid': None,
            'power_user': True
        }

    def test_get_sha1_for_file(self, client):
        file_path = os.path.join(os.path.dirname(__file__), "hash_test.json")
        sha1 = client.get_hash_for_file(file_path)
        assert sha1 == 'edd22313d5aec9041b405953bfb10168b1d58b2e'

    def test_get_all_events(self, client, owner_client, rate_setter):
        owner_client.add_rate_setter(rate_setter.address)
        block_number = rate_setter.w3.eth.getBlock('latest')['number']

        client.designate_beneficiary('0x73fCe79Bb6341e82E45cF58AAB680F6Af7019342')
        events = client.get_events('BeneficiaryChanged')
        assert events == [{
            'event': 'BeneficiaryChanged',
            'event_args': {
                'client_address': client.address,
                'beneficiary_address': '0x73fCe79Bb6341e82E45cF58AAB680F6Af7019342'
            },
            'block_number': block_number + 1,
            'block_timestamp': client.w3.eth.getBlock(block_number + 1)['timestamp'],
            'block_datetime': datetime.utcfromtimestamp(client.w3.eth.getBlock(block_number + 1)['timestamp']),
            'transaction': events[0]['transaction']
        }]

    def test_event_names(self, client):
        events = client.event_names
        assert len(events) >= 20
        assert 'AuctionPriceSet' in events
        assert 'FileCreated' in events
        assert 'LeptonAdded' in events
        assert 'BeneficiaryChanged' in events
