# -*- coding: utf-8 -*-
"""
    devise.DeviseClient
    ~~~~~~~~~
    This is the basic wrapper class around all Devise client facing operations. This wrapper connects to an Ethereum
    node and facilitates smart contract operations such as provision, leaseAll, getBalance, etc. It also allows for the
    download of the rented data.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
from .api import RentalAPI
from .contract import RentalContract
from .token_sale import TokenSale


class DeviseClient(RentalContract, RentalAPI, TokenSale):
    """
    This the wrapper class around all Devise operations.

    Please note:
      1- This is a thin wrapper around web3.py and all operations in this wrapper can be done more verbosely with web3.
      2- Your private key is used to sign transactions and messages locally and is never transmitted.

    Usage:
        Option 1, using a hardware wallet (Ledger or Trezor):
            # Create a client instance connecting to your wallet (make sure to have it plugged in).
            client = DeviseClient(account='0x12134535...', auth_type='ledger')
            client.buy_tokens(1000000)
            client.provision(1000000)
            balance = client.dvz_balance_escrow

        Option 2, using an encrypted json keystore file:
            # Create a client instance using a json keystore file exported from a wallet
            # Note: the private key is only used locally and is never transmitted to the node
            client = DeviseClient(key_file='/path/to/key-file.json/)
            client.buy_tokens(1000000)
            client.provision(1000000)
            balance = client.dvz_balance_escrow

        Option 3, using a private key directly:
            # Create a client instance providing a clear text private key exported from an Ethereum wallet
            # Note 1: the private key is only used locally and is never transmitted to the node
            # Note 2: if you don't specify a password, you will be prompted to enter a password to decrypt your key file
            # for each transaction.
            client = DeviseClient(private_key='35e51d3f2e0c24c6e21a93...')
            client.buy_tokens(1000000)
            client.provision(1000000)
            balance = client.dvz_balance_escrow

        Option 4, using an account address and a local Official Ethereum Wallet
            # Create a client instance providing the address of the account to use.
            # DeviseClient can find the corresponding encrypted keystore in the default keystore paths on disk without
            # you having to specify a path.
            # Note 1: the private key is only used locally and is never transmitted to the node
            # Note 2: if you don't specify a password, you will be prompted to enter a password to decrypt your key file
            # for each transaction.
            client = DeviseClient(account='0x12134535...')
            client.buy_tokens(1000000)
            client.provision(1000000)
            balance = client.dvz_balance_escrow
    """
    pass
