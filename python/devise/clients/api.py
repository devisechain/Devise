# -*- coding: utf-8 -*-
"""
    devise.clients.RentalAPI
    ~~~~~~~~~
    This is the wrapper around the Pit.AI web API. It signs requests to the API using ethereum credentials or keys and
    handles downloading the rented data from the web API.

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""
import csv
import io
import os
import shutil
import tempfile
from collections import OrderedDict
from getpass import getpass
from urllib.parse import urlencode
from zipfile import ZipFile

from eth_account.messages import defunct_hash_message

from devise.base import BaseDeviseClient

API_ROOT = os.environ.get('API_ROOT_URL', 'https://api.pit.ai')


class RentalAPI(BaseDeviseClient):
    """
    Base class for all API related functions
    """

    def get_signed_api_url(self, api_uri, params=None):
        """
        Creates a signed URL to access the pit.ai API

        Example Usage:
            url = client.get_signed_api_url(
                      '/v1/strategy/0x627306090abab3a6e1400e9345bc60c78a8bef57/weights',
                      {start_timestamp: 1515615156})

        """

        assert params is None or type(params) == dict, "Invalid params: params_dict must be of type dict!"

        # Make sure our address is in the URL we're signing
        params = {} if params is None else params
        params["address"] = self.address

        # Build the url to sign: sorted params and lower case
        query_string = urlencode(OrderedDict(sorted(params.items(), key=lambda t: t[0])))
        payload = (api_uri + '?' + query_string).lower()

        # If we have no local means to sign transactions, raise error
        if not (self._ledger or self._key_file or self._private_key):
            raise ValueError("No valid signing method found!\n"
                             "Please specify one of: key_file, private_key, auth_type='ledger' or auth_type='trezor'")

        private_key = self._private_key
        if self._key_file:
            password = self._password or getpass("Password to decrypt keystore file %s: " % self.account)
            private_key = self._get_private_key(self._key_file, password)

        # Calculate signature
        if private_key:
            signature = self.w3.eth.account.signHash(defunct_hash_message(text=payload), private_key=private_key)
            signature_bytes = signature["signature"]
            params["signature"] = signature_bytes.hex()
        else:
            raise ValueError("Could not sign url, please provide a private key or key_file!")

        return api_uri + "?" + urlencode(OrderedDict(sorted(params.items(), key=lambda t: t[0])))

    def _download(self, url, local_file_name):
        """Downloads the URL specified as the local file name specified"""
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'DevisePythonWrapper/1.0.0'})

        with urllib.request.urlopen(req) as response, open(local_file_name, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)

    def _get_latest_weights_date_from_contents(self, latest_weights_file):
        """Gets the last available date from the latest weights file"""
        with ZipFile(latest_weights_file) as zip:
            with zip.open(zip.namelist()[0]) as csvfile:
                csv_reader = csv.DictReader(io.TextIOWrapper(csvfile))
                return next(csv_reader).get('date', '')

    def download_latest_weights(self):
        """Downloads the last weights available for for each lepton in the blockchain"""
        api_url = API_ROOT + self.get_signed_api_url('/v1/strategy/latest_weights')
        self.logger.info("Downloading %s", api_url)
        with tempfile.NamedTemporaryFile() as temp:
            self._download(api_url, temp.name)
            content_date = self._get_latest_weights_date_from_contents(temp.name)
            file_name = 'devise_latest_weights_{content_date}.zip'.format(content_date=content_date)
            shutil.copy(temp.name, file_name)
            return file_name

    def download_historical_weights(self):
        """Downloads a historical archive with all the weights calculated for each lepton in the blockchain
         excluding recent weights"""
        api_url = API_ROOT + self.get_signed_api_url('/v1/strategy/historical_weights')
        self._download(api_url, 'devise_historical_weights.tar')

    def download_historical_returns(self):
        """Downloads a historical archive with all the returns calculated for each lepton in the blockchain
         excluding recent returns"""
        api_url = API_ROOT + self.get_signed_api_url('/v1/strategy/historical_returns')
        self._download(api_url, 'devise_historical_returns.tar')
