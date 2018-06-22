###########################################################################################
Devise: An Ethereum Marketplace for Engineering Better Representations of Financial Markets
###########################################################################################

**Our smart contracts have not been deployed to the main Ethereum network yet, as they are currently undergoing a security audit. They will be deployed right after our security audit, at which point our Python package will be fully functional. Please regularly check this repo for an update.**

Official Python 3 client to interact with the Devise marketplace. To learn more about Devise, checkout our primer_.



.. contents:: Table of Contents



Installation
==============

The easiest way to install the devise repo is from PyPi:

.. code-block:: text

    $ pip install devise


Alternatively, you may clone this repo and install it:

.. code-block:: text

    $ git clone https://github.com/devisechain/Devise
    $ cd Devise/python
    $ pip install .


We also provide a Docker image on Docker hub for your convenience:

.. code-block:: text

    $ docker run -ti -v ~/.devise:/root/.devise:rw devisechain/python

The corresponding Dockerfile can be found in this repo under the python directory.

How To Create A Client
======================

The repo connects to the Ethereum network either through a public Ethereum node.


For signing Ethereum transactions and requests to our cryptographic API, we support the `Official Ethereum Wallet`_, hardware wallets (`Ledger Nano S`_ and Trezor_ to be specific), encrypted keystore files, and clear private keys.


All Devise-related operations can be performed through the :code:`DeviseClient` class.

To use the `Official Ethereum Wallet`_, run

.. code-block:: python

    from devise import DeviseClient
    # Create a devise client object to interact with our smart-contracts and API.
    devise_client = DeviseClient(account='0xd4a6B94E45B8c0185...', password='<your password>')


To use a hardware wallet, run

.. code-block:: python

    from devise import DeviseClient
    # Create a devise client object to interact with our smart-contracts and API.
    devise_client = DeviseClient(account='0xd4a6B94E45B8c0185...', auth_type='[ledger|trezor]')


To use a keystore file, run

.. code-block:: python

    from devise import DeviseClient
    # Create a devise client object to interact with our smart-contracts and API.
    devise_client = DeviseClient(key_file='<path to your encrypted json keystore file>', password='<your password>')


To use a clear private key, run

.. code-block:: python

    from devise import DeviseClient
    # Create a devise client object to interact with our smart-contracts and API.
    devise_client = DeviseClient(private_key='<your private key>')


The :code:`password` argument is always optional. When it is needed for signing but not provided, you will be prompted to type it in every time a transaction needs to be signed.

If needed, you can override the public node used to connect to the Ethereum network by specifying a :code:`node_url` when creating your :code:`DeviseClient` instance.


How To Access To The Devise Blockchain
======================================

In order to access the Devise blockchain, you need to i) have enough DVZ tokens, ii) fund your escrow account with us in DVZ, iii) submit a bid, and iv) request data from the API if your bid is successful.


Here are a few ways of buying DVZ tokens in our initial sale:

.. code-block:: python

    # Example 1: Buy 1,500,000 DVZ tokens
    status = devise_client.buy_tokens(1500000)

    # Example 2: Buy 150 ethers worth of DVZ tokens
    status = devise_client.buy_eth_worth_of_tokens(150)

    # Example 3: Buy 75,000 USD worth of DVZ tokens
    # The ETH/USD rate is retrieved from GDAX to infer the ETH equivalent of your
    # USD amount, which you need to have in your wallet as we only accept ETH.
    status = devise_client.buy_usd_worth_of_tokens(75000)


To transfer 1,000,000 DVZ tokens from your wallet to your escrow account with us, run

.. code-block:: python

    # Record your current wallet DVZ balance
    dvz_balance = devise_client.dvz_balance

    # Provision your escrow account
    status = devise_client.provision(1000000)

    # Check that your tokens made it
    assert devise_client.dvz_balance_escrow >= 1000000

    # Check that your wallet balance has dropped by 1,000,000
    assert devise_client.dvz_balance == dvz_balance-1000000


If needed, you can request historical data to assess value-add:

.. code-block:: python

    # Request the right to access historical data.
    # Note: Historical data are free of charge, but your escrow account
    # must be sufficiently provisioned to pay one month rent for this
    # request to be approved.
    status = devise_client.request_historical_data_access()

    # Check if you are currently allowed to request historical data.
    has_access = devise_client.client_summary['historical_data']
    print(has_access)

    # Download historical weights of all leptons on the devise
    # blockchain and store them in the file 'devise_historical_weights.tar'
    # in the current folder.
    historical_weights = devise_client.download_historical_weights()

    # Download historical returns of all leptons on the devise
    # blockchain and store them in the file 'devise_historical_returns.tar'
    # in the current folder.
    historical_returns = devise_client.download_historical_returns()

Once you know how many seats you want to bid for, and at what price, you can submit your bid by running

.. code-block:: python

    # Example: submit a bid for 10 seats on the devise blockchain, for a monthly rent capped at 200,000 DVZ.
    seats = 10
    # Note: The limit monthly rent per seat below is indicative.
    lmt_monthly_rent_per_seat = 200000
    # The limit price the auction abides by is the limit price per bit of total incremental usefulness.
    # If between terms leptons are added to the chain, the total incremental usefulness might change,
    # and as a result you might be paying a higher rent. Your rent per seat and per unit of total
    # incremental usefulness will however never excess your specified limit price per bit.
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

    # Download latests weights of all leptons on the devise blockchain
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
