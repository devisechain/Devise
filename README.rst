#################################
Devise: The Alternative Exchange
#################################

**Assets aren’t listed on traditional exchanges so that hedge funds can generate alpha, but clearly markets aren’t fully efficient, and there is alpha to grab. Devise is an alternative exchange containing hundreds of synthetic assets that have been engineered from the ground-up to help fund managers hunt alpha. Synthetic assets can be accessed anonymously, and scarcity of access is guaranteed and can be audited without a trusted central party and in a fully decentralized fashion.**

Devise synthetic assets are listed on Devise if and only if they provably add value to all assets already on Devise, as well as 60 of the most liquid U.S. futures (accounting for more than 90% of trading volume) as per the information-theoretical proof-of-usefulness framework described in our `Yellow Paper <https://github.com/devisechain/Devise/blob/master/yellow_paper.pdf>`_.

Each synthetic asset on Devise is a unique data stream accessible through a crypto-powered API. An Ethereum smart-contract is used to (anonymously) control access right to the API, users are identified by their Ethereum addresses, and the Ethereum blockchain can be used as a decentralized audit system for scarcity of access.

Access to Devise is granted on a subscription basis with monthly terms renewed automatically until cancelled. Fees are paid in a custom (in-app) utility token, namely the Devise token or DVZ. The monthly fee is automatically set every month by the rental smart contract through an auction mechanism aiming at maximizing the value of the Devise alternative exchange based on clients bids, and under the scarcity constraint on the number of access. To access Devise, a client should be attributed one of 100 seats. Clients wishing to further restrict access to Devise can choose to subscribe to more than 1 seat, up to the maximum of 100, and pay a higher rent accordingly.

This repo contains the official Python 3 client supporting all Devise-related operations, as well as a Javascript library and all Solidity source code. 

To learn more about Devise, checkout our primer_.


.. contents:: Table of Contents



Installation
============

The easiest way to install the devise repo is from PyPi:

.. code-block:: text

    $ pip install devise

Alternatively, you may clone this repo and install it:

.. code-block:: text

    $ git clone https://github.com/devisechain/Devise
    $ cd Devise/python
    $ pip install .


For more detailed installation instructions, and for information on platform specific system dependencies, please consult our `Installation Guide <https://github.com/devisechain/Devise/wiki/8.-Installation-Guide>`_



How To Use Our Python Package
=============================

All Devise-related operations can be performed through the :code:`DeviseClient` class. 

A :code:`DeviseClient` object connects to the Ethereum network through a public Ethereum node both for on-chain operations (a.k.a. transactions) that require signing, and for free off-chain operations (a.k.a. calls).

For any operation requiring cryptographic signing we support the `Official Ethereum Wallet`_, hardware wallets (`Ledger Nano S`_ and Trezor_ to be specific), encrypted keystore files, and clear private keys.



To use the `Official Ethereum Wallet`_, run

.. code-block:: python

    from devise import DeviseClient
    # Create a Devise client object to interact with our smart contracts and API.
    devise_client = DeviseClient(account='0xd4a6B94E45B8c0185...', password='<your password>')


To use a hardware wallet, run

.. code-block:: python

    from devise import DeviseClient
    # Create a Devise client object to interact with our smart contracts and API.
    devise_client = DeviseClient(account='0xd4a6B94E45B8c0185...', auth_type='[ledger|trezor]')


To use a keystore file, run

.. code-block:: python

    from devise import DeviseClient
    # Create a Devise client object to interact with our smart contracts and API.
    devise_client = DeviseClient(key_file='<path to your encrypted json keystore file>', password='<your password>')


To use a clear private key, run

.. code-block:: python

    from devise import DeviseClient
    # Create a Devise client object to interact with our smart contracts and API.
    devise_client = DeviseClient(private_key='<your private key>')


The :code:`password` argument is always optional. When it is needed for signing but not provided, you will be prompted to type it in every time a transaction needs to be signed.

If needed, you can override the public node used to connect to the Ethereum network by specifying your own :code:`node_url` when creating your :code:`DeviseClient` instance.




How To Access The Devise Alternative Exchange
=============================================

In order to access the Devise alternative exchange, you need to i) have enough Devise tokens (DVZ) in your escrow account, ii) submit a bid, and iii) request data from the API if your bid is successful.


To fund your escrow account with us, run:

.. code-block:: python

    # Provision your escrow account with DVZ by transferring qty ETH from your Ethereum wallet to the rental Smart contract.
    qty = 1000
    devise_client.fund_account(amount=qty, unit='ETH', source='ETH')

    # Check your remaining escrow balance in DVZ tokens
    remaining = devise_client.dvz_balance_escrow


If needed, you can request historical data to assess value-add:

.. code-block:: python

    # Note: Historical data are free of charge, but your escrow account
    # must be sufficiently provisioned to pay one month rent to be allowed
    # access historical data.

    # Check if you are currently allowed to request historical data.
    has_access = devise_client.client_summary['historical_data_access']
    print(has_access)

    # Download historical weights of all leptons on the Devise alternative
    # exchange and store them in the file 'devise_historical_weights.tar'
    # in the current folder.
    devise_client.download_historical_weights()

    # Download historical returns of all leptons on the Devise alternative
    # exchange and store them in the file 'devise_historical_returns.tar'
    # in the current folder.
    devise_client.download_historical_returns()

Once you know how many seats you want to bid for, and at what price, you can submit your bid by running

.. code-block:: python

    # Example: submit a bid for 10 seats on the Devise alternative exchange, for a monthly rent capped at 200,000 DVZ.
    seats = 10
    # Note: The limit monthly rent per seat below is indicative.
    lmt_monthly_rent_per_seat = 200000
    # The limit price the auction abides by is the limit price per bit of total incremental usefulness.
    # If between terms leptons are added to the chain, the total incremental usefulness might change,
    # and as a result you might be paying a higher rent. Your rent per seat and per unit of total
    # incremental usefulness will however never exceed your specified limit price per bit.
    lmt_price = lmt_monthly_rent_per_seat/devise_client.total_incremental_usefulness
    devise_client.lease_all(lmt_price, seats)


To check if you won seats in the current term, run

.. code-block:: python

    # Check how many seats you have access to in the current term.
    total_seats = devise_client.current_term_seats
    has_seats = total_seats > 0
    print(has_seats)

If you are entitled seats, you can request portfolio weights updates by running

.. code-block:: python

    # Download latests weights of all leptons on the Devise alternative exchange
    # and stores them in the file 'devise_latest_weights_<yyyy-mm-dd>.tar'
    # in the current folder. Data updates are available on a daily basis before 7AM ET.
    latest_weights = devise_client.download_latest_weights()


For more information, checkout our wiki_.


.. _Trezor: https://trezor.io/

.. _`Ledger Nano S`: https://www.ledgerwallet.com/

.. _`Official Ethereum Wallet`: https://www.ethereum.org/

.. _primer: https://github.com/devisechain/Devise/wiki/1.-Devise-Primer

.. _wiki: https://github.com/devisechain/Devise/wiki/1.-Devise-Primer

.. _Official Repo: https://github.com/devisechain/devise
