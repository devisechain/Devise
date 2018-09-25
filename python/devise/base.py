# -*- coding: utf-8 -*-
"""
    devise.BaseEthereumClient
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This is the base class for all smart contract operations including signing transaction with account or private key.

    :copyright: © 2018 Pit.AI
    :license: GPLv3, see LICENSE for more details.
"""
import json
import logging
import os
import sys
from getpass import getpass
from pathlib import Path

import requests
import rlp
import web3
from eth_account import Account
from eth_account.internal.transactions import serializable_unsigned_transaction_from_dict, encode_transaction
from eth_keyfile import create_keyfile_json
from ledgerblue.commException import CommException
from web3 import Web3
from web3.gas_strategies.time_based import fast_gas_price_strategy
from web3.middleware import geth_poa_middleware
from web3.providers import HTTPProvider

from .ledger import LedgerWallet

IU_PRECISION = 1e6
CDN_ROOT = 'https://config.devisefoundation.org/config.json'
resp = requests.get(CDN_ROOT)
resp_json = resp.json()
CONTRACT_ADDRESSES = resp_json["CONTRACT_ADDRESSES"]
NETWORK_TO_NODE = resp_json["NETWORK_TO_NODE"]

NODE_TO_NETWORK = {NETWORK_TO_NODE[network]: network for network in NETWORK_TO_NODE.keys()}

network = os.environ.get("ETHEREUM_NETWORK", "mainnet")
API_ROOT = resp_json["API_ROOT_URL"].get(network.upper(), 'https://api.devisechain.io')


def get_contract_abi(contract_name):
    """
    Reads the json abi files for the contract specified
    :param contract_name:
    :return:
    """
    current_dir = os.path.dirname(os.path.realpath(__file__))
    abi_path = os.path.join(current_dir, 'abi', contract_name + '.json')
    return json.load(open(abi_path, 'r'))


def costs_gas(function):
    """
    Decorator to mark methods that incur gas on the Ethereum network
    """
    return function


def get_default_node_url(network=None):
    """
    Get the right public or private node url for the blockchain network specified
    :param network: one of the supported Ethereum test networks (mainnet, rinkeby, dev1, dev2, ganache)
    """
    if network is None:
        network = os.environ.get("ETHEREUM_NETWORK", "mainnet")

    node_url = NETWORK_TO_NODE.get(network.upper(), None)

    if node_url is None:
        raise ValueError("Unsupported network %s" % network)

    return node_url


def get_rental_contract_addresses(network_id="1"):
    """
    Get a list of all the rental proxy addresses we've ever deployed for audit purposes
    """
    contract_addresses = CONTRACT_ADDRESSES.get(network_id, {}).get('DEVISE_RENTAL_PREVIOUS_ADDRESSES', [])
    contract_addresses += [CONTRACT_ADDRESSES.get(network_id, {}).get('DEVISE_RENTAL')]

    return contract_addresses


def get_events_node_url(network_id="1"):
    """
    Get any custom node required to query events from the block chain (for example Infura has issues querying too far
     in the past)
    """
    events_nodes = resp_json.get('EVENT_QUERY_NODES', {})
    return events_nodes.get(network_id)


def _create_account(passwd):
    acct = Account().create()
    priKey = acct.privateKey
    key_json = create_keyfile_json(priKey, passwd)
    return key_json, acct.address


def _save_account_to_file(key_json, address):
    home = os.path.expanduser('~')
    fpath = os.path.join(home, '.devise', 'keystore', address.lower() + '.json')
    dirname = os.path.dirname(fpath)
    if not os.path.exists(dirname):
        os.makedirs(dirname)
    if not os.path.exists(fpath):
        obj = open(fpath, 'w')
        obj.write(json.dumps(key_json))
        obj.close()
        os.chmod(fpath, 0o600)

    return fpath


def generate_account():
    """
    Generates a new private/public key pair and saves them into an encrypted json keystore file on disk
    :return: The path to a standard keystore file
    """
    passwd = getpass("Password to encrypt the new json keystore file:")
    key_json, address = _create_account(bytes(passwd, 'utf8'))
    fpath = _save_account_to_file(key_json, address)
    return fpath, address


class BaseEthereumClient(object):
    def __init__(self, key_file=None, private_key=None, account='0x0000000000000000000000000000000000000000',
                 password=None, auth_type=None, node_url=None):
        """
        Devise constructor
        :param key_file: An encrypted json keystore file, requires a password to decrypt
        :param private_key: An Ethereum private key to use to sign messages and smart contract transactions
        :param account: The Ethereum address to use to sign messages and smart contract transactions
        :param password: The password to decrypt the encrypted key store file.
        :param auth_type: One of "ledger", or "trezor", "key_file", "private_key", "software".
                If auth_type is None (the default), we will attempt to use each signing methods until one is found in the
                order: hardware, private_key, key_file, then software.
                Note: the software option will attempt the locate the account specified in the local Ethereum Wallet
                path for the current user.
        :param node_url: An Ethereum node to connect to
        """
        assert key_file or private_key or account, "Please specify one of: account, key_file or private_key!"
        assert not (key_file and private_key), "Please specify either key_file or private_key, not both!"

        # logging
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)
        self.logger.handlers.clear()
        self.logger.addHandler(logging.StreamHandler())

        # Initialize credentials for transaction and message signing
        self._init_credentials(key_file, private_key, account, password, auth_type)

        # Connect to node url
        if node_url is None:
            node_url = get_default_node_url()
        provider = self._get_provider(node_url)
        self.w3 = Web3(provider)
        self._network_id = self._get_network_id()

        network = NODE_TO_NETWORK.get(node_url, "CUSTOM")
        if network == "MAINNET":
            self.logger.info("!!!!!! WARNING: CONNECTED TO THE MAIN ETHEREUM NETWORK. "
                             "ALL TRANSACTIONS ARE FINAL. !!!!!")

        elif network == "CUSTOM":
            self.logger.info("WARNING: Connected to the Ethereum network corresponding "
                             "to your chosen node (%s)! All transactions are final!" % node_url)

        else:
            self.logger.info("INFO: Connected to the %s Ethereum network." % network)

        # inject the poa compatibility middleware to the innermost layer
        self.w3.middleware_stack.inject(geth_poa_middleware, layer=0)

        # Automatically determine necessary gas based on 5min to mine avg time
        self.w3.eth.setGasPriceStrategy(fast_gas_price_strategy)
        self._api_root = API_ROOT

    def _init_credentials(self, key_file, private_key, account, password, auth_type):
        """
        Initialize the signing credentials
        :param key_file: An encrypted json keystore file, requires a password to decrypt
        :param private_key: An Ethereum private key to use to sign messages and smart contract transactions
        :param account: The Ethereum address to use to sign messages and smart contract transactions
        :param password: The password to decrypt the encrypted key store file.
        :param auth_type: One of "ledger", or "trezor", "key_file", "private_key", "software".
                If auth_type is None (the default), we will attempt to use each signing methods until one is found in the
                order: hardware, private_key, key_file, then software.
                Note: the software option will attempt the locate the account specified in the local Ethereum Wallet
                path for the current user.
        """
        auth_type = auth_type.lower() if auth_type else None
        self._key_file = key_file
        self._private_key = private_key
        self.account = Web3.toChecksumAddress(account) if account else None
        self.address = self.account
        if auth_type in [None, 'ledger', 'trezor'] and self._hardware_wallet_init(auth_type):
            return True
        if auth_type in [None, 'private_key'] and self._private_key_init(private_key):
            return True
        if auth_type in [None, 'key_file'] and self._key_file_init(key_file, password):
            return True
        if auth_type in [None, 'software'] and self._account_init(account, password):
            return True

    def _hardware_wallet_init(self, auth_type):
        """Initialize hardware wallets"""
        self._ledger = None
        if auth_type in ["ledger", "trezor"]:
            assert auth_type == 'ledger', "Unsupported hardware wallet, only Ledger is supported at this time"
            try:
                self._ledger = LedgerWallet()
                return True
            except CommException:
                self.logger.error('No Ledger USB dongle found!')
                raise

    def _private_key_init(self, private_key):
        """Initialize using a private key"""
        # calculate account from private key if we were only given private key
        self._private_key = private_key[2:] if private_key and private_key.startswith('0x') else private_key
        if self._private_key:
            self.account = Account.privateKeyToAccount(self._private_key).address  # pylint: disable=E1120
            self.address = self.account
            return True

    def _key_file_init(self, key_file, password=None):
        """Initialize using a local json encrypted key file"""
        self._key_file = key_file
        if key_file:
            # get account from key_file if we were only given key_file
            self.account = Web3.toChecksumAddress(self._get_account_from_key_file(key_file))
            self.address = self.account
            self._password = password
            return True

    def _account_init(self, account, password=None):
        """Initialize using a local software wallet"""
        # If we're given an account, try to find it in the known keystore locations on disk
        self.account = Web3.toChecksumAddress(account)
        self.address = self.account
        self._password = password
        self._key_file = self._scan_for_keystore_file(self.account)
        if self._key_file:
            return True

    def _ethereum_data_dir(self):
        """Returns the location of the local Ethereum data directory if any"""
        # Mac/Darwin
        if sys.platform == 'darwin':
            eth_path = os.path.expanduser(os.path.join("~", "Library", "Ethereum"))
            if os.path.exists(eth_path):
                return eth_path
            eth_path = os.path.expanduser(os.path.join("~", "Library", "Application Support", "io.parity.ethereum"))
            if os.path.exists(eth_path):
                return eth_path
        # Linux
        elif sys.platform.startswith('linux'):
            eth_path = os.path.expanduser(os.path.join("~", ".ethereum"))
            if os.path.exists(eth_path):
                return eth_path
            eth_path = os.path.expanduser(os.path.join("~", ".local", "share", "io.parity.ethereum"))
            if os.path.exists(eth_path):
                return eth_path
        # Windows
        elif sys.platform == 'win32':
            eth_path = os.path.expanduser(os.path.join("~", "AppData", "Roaming", "Ethereum"))
            if os.path.exists(eth_path):
                return eth_path
            eth_path = os.path.expanduser(os.path.join("~", "AppData", "Roaming", "Parity", "Ethereum"))
            if os.path.exists(eth_path):
                return eth_path

    def _scan_for_keystore_file(self, account):
        """Find a matching encrypted keystore file in the known Ethereum Wallet locations"""
        path = self._ethereum_data_dir()
        search_account = account if account[:2] != '0x' else account[2:]
        if path:
            with Path(path) as p:
                for file in p.glob("**/*--%s" % search_account.lower()):
                    self.logger.info("Found matching keystore file on disk: %s" % file)
                    return str(file)
        with Path(os.path.join(os.path.expanduser('~'), '.devise', 'keystore')) as p:
            for file in p.glob("**/*%s*" % search_account.lower()):
                self.logger.info("Found matching keystore file on disk: %s" % file)
                return str(file)

    def _get_network_id(self):
        """Current Ethereum network id"""
        try:
            return self.w3.version.network
        except:
            self.logger.warning(
                "Could not communicate with Ethereum node to determine current network, assuming main net!")
            return "1"

    def _get_private_key(self, key_file, password):
        """
        Decrypts a key file on disk with the given password and returns the private key
        :param key_file: An encrypted json keystore file, requires a password to decrypt
        :param password: The password to decrypt the encrypted key store file
        :return:
        """
        json_dict = json.load(open(key_file, 'r'))
        return self.w3.toHex(Account.decrypt(json_dict, password))[2:]

    def _get_account_from_key_file(self, key_file):
        """
        Gets the clear text address from the keystore file
        :param key_file: string the path of an encrypted Ethereum key file
        :return: string the address of the account encrypted into the key_file
        """
        json_dict = json.load(open(key_file, 'r'))
        return '0x' + json_dict["address"]

    def _wait_for_receipt(self, tx_hash):
        """Blocks until the transaction receipt is mined"""
        return self.w3.eth.waitForTransactionReceipt(tx_hash, timeout=60)

    def _transact(self, function_call=None, transaction=None):
        """Transaction utility: builds a transaction and signs it with private key, or uses native transactions with
        accounts
        """
        # If we have no local means to sign transactions, raise error
        if not (self._ledger or self._key_file or self._private_key):
            raise ValueError("No valid signing method found!\n"
                             "Please specify one of: key_file, private_key, auth_type='ledger' or auth_type='trezor'")

        private_key = self._private_key
        if self._key_file:
            password = self._password if self._password is not None else ""
            # Try decoding the key file, prompting user for password if needed
            while not private_key:
                try:
                    private_key = self._get_private_key(self._key_file, password)
                except ValueError:
                    if self._password is not None:
                        raise ValueError('Invalid password specified for key file %s' % self._key_file)
                    # If no password was specified, we're running interactively, prompt for password
                    password = getpass("Password to decrypt keystore file %s: " % self.account)

        # Build a transaction to sign
        gas_buffer = 100000
        # Estimate gas cost
        if transaction is None:
            transaction = {}

        auto_gas_price = self.w3.eth.generateGasPrice()
        user_gas_price = transaction.get('gasPrice')
        transaction.update({
            'nonce': transaction.get("nonce", self.w3.eth.getTransactionCount(self.address)),
            'gas': 4000000,
            'gasPrice': auto_gas_price
        })
        if function_call:
            transaction = function_call.buildTransaction(transaction)

        gas_limit = self.w3.eth.estimateGas(transaction) + gas_buffer
        transaction.update({
            'gas': gas_limit,
            'gasPrice': user_gas_price if user_gas_price is not None else auto_gas_price
        })

        if 'from' in transaction:
            del transaction['from']
        if private_key:
            # Sign the transaction using the private key and send it as raw transaction
            signed_tx = self.w3.eth.account.signTransaction(transaction, '0x' + private_key)
            tx_hash = self.w3.eth.sendRawTransaction(signed_tx.rawTransaction)
        else:
            unsigned_transaction = serializable_unsigned_transaction_from_dict(transaction)
            pos = self._ledger.get_account_index(self.address)
            self.logger.info(
                "Signing transaction with your hardware wallet, please confirm on the hardware device when prompted...")
            (v, r, s) = self._ledger.sign(rlp.encode(unsigned_transaction), account_index=pos)
            encoded_transaction = encode_transaction(unsigned_transaction, vrs=(v, r, s))
            tx_hash = self.w3.eth.sendRawTransaction(encoded_transaction)

        self.logger.info("Submitted transaction %s, waiting for transaction receipt..." % tx_hash.hex())
        tx_receipt = None
        while not tx_receipt:
            try:
                tx_receipt = self._wait_for_receipt(tx_hash)
            except web3.utils.threads.Timeout:
                self.logger.warning("Transaction still pending after 1 minute, waiting some more...")

        self.logger.info("Gas used: %s at gas price of %.2f gwei (%.8f ether)" % (
            tx_receipt.get("gasUsed"), self.w3.fromWei(transaction.get("gasPrice"), 'gwei'),
            self.w3.fromWei(tx_receipt.get("gasUsed") * transaction.get("gasPrice"), 'ether')))

        return hasattr(tx_receipt, "status") and tx_receipt["status"] == 1

    def transfer_ether(self, to_address, value):
        """Utility function to transfer ethers to another Ethereum address"""
        assert to_address
        wei_value = Web3.toWei(value, 'ether')
        return self._transact(None, {
            "from": self.address,
            "to": Web3.toChecksumAddress(to_address),
            "value": wei_value})

    def _get_provider(self, node_url):
        """Given a node url, returns the right Web3 provider"""
        if node_url[:4] in ['wss:', 'ws:/']:
            provider = Web3.WebsocketProvider(node_url)
        else:
            provider = HTTPProvider(node_url)

        return provider


class BaseDeviseClient(BaseEthereumClient):
    """Base class for all Devise contract classes"""

    def __init__(self, *args, **kwargs):
        super(BaseDeviseClient, self).__init__(*args, **kwargs)

        # Initialize contract objects
        self._init_contracts()

    def _init_contracts(self):
        # contract addresses for the current network (if any)
        contract_addresses = CONTRACT_ADDRESSES.get(self._get_network_id(), {})
        # The Devise Token
        self._token_contract = self.w3.eth.contract(address=contract_addresses.get('DEVISE_TOKEN'),
                                                    abi=get_contract_abi('DeviseToken'))
        # The Devise Rental Contract
        rental_abi = get_contract_abi('DeviseRentalImpl')
        self._rental_contract = self.w3.eth.contract(address=contract_addresses.get('DEVISE_RENTAL'),
                                                     abi=rental_abi)
        self._rental_proxy_contract = self.w3.eth.contract(address=contract_addresses.get('DEVISE_RENTAL'),
                                                           abi=get_contract_abi('DeviseRentalProxy'))

        if self._token_contract.address is None or self._rental_contract.address is None:
            raise RuntimeError(
                "\n\n"
                "****************************************************************************************************\n"
                "* Our smart contracts have not been deployed to the main Ethereum network yet,                     *\n"
                "* as they are currently undergoing a security audit. They will be deployed                         *\n"
                "* right after our security audit, at which point our Python package will be fully functional.      *\n"
                "* Please regularly check this repo for an update.                                                  *\n"
                "****************************************************************************************************\n")
