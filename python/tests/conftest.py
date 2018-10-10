import os

# For unit tests, use local ganache test network
os.environ["ETHEREUM_NETWORK"] = "ganache"

import pytest
from ledgerblue.commException import CommException
from web3 import Web3

from devise import DeviseClient, MasterNode
from devise.clients.token import DeviseToken
from devise.owner import DeviseOwner
from devise.owner.token_owner import DeviseTokenOwner
from .utils import TEST_KEYS


@pytest.fixture()
def client():
    """Devise Client fixture created using an account's private key"""
    client = DeviseClient(private_key=TEST_KEYS[5])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def client_ledger():
    """Devise Client fixture created to use Ledger nano s hardware wallet"""
    try:
        client = DeviseClient(account='0x879CEAA289334fE176B95ba341Dc2780ECE4da20', auth_type='ledger')
    except CommException:
        return None

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def owner_client():
    """Devise Client fixture created using an account's private key"""
    client = DeviseOwner(private_key=TEST_KEYS[0])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    escrow_wallet_account = Web3().eth.accounts[3]
    client_wallet = DeviseClient(private_key=TEST_KEYS[3])
    accounting_contract = client_wallet._rental_contract.functions.accounting().call()
    client_wallet._transact(client_wallet._token_contract.functions.approve(accounting_contract, int(1e20)),
                            {"from": escrow_wallet_account})
    return client


@pytest.fixture()
def token_owner_client():
    """Devise Client fixture created using an account's private key"""
    client = DeviseTokenOwner(private_key=TEST_KEYS[1])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def token_wallet_client():
    """Devise Client fixture created using an account's private key"""
    client = DeviseToken(private_key=TEST_KEYS[2])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def token_client():
    """Devise Client fixture created using an account's private key"""
    client = DeviseToken(private_key=TEST_KEYS[0])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def master_node():
    """Devise Client fixture created using an account's private key"""
    client = MasterNode(private_key=TEST_KEYS[0])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def rate_setter():
    """Devise Client fixture created for setting rate"""
    client = DeviseOwner(private_key=TEST_KEYS[5])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def weights_updater():
    """Devise Client fixture created for setting rate"""
    client = DeviseOwner(private_key=TEST_KEYS[5])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def client_local_pk():
    """Devise Client fixture created using an account's private key"""
    client = DeviseClient(private_key=TEST_KEYS[5])

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client


@pytest.fixture()
def client_local_keyfile(token_wallet_client):
    """Devise Client fixture created using an account's private key"""
    key_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'key_file.json')
    client = DeviseClient(key_file=key_path)

    # TODO Remove this and replace with real provisioning with ether in the tests
    token_wallet_client.transfer(client.address, 10000000)

    net_id = client.w3.version.network
    if net_id == "1":
        raise RuntimeError("Cowardly refusing to run tests against MainNet!!")

    return client
