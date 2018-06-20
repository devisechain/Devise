import os

from pytest import raises

from devise import DeviseClient


class TestNoContracts(object):
    def test_no_contracts(self):
        try:
            with raises(RuntimeError):
                os.environ["ETHEREUM_NETWORK"] = "mainnet"
                client = DeviseClient()
        finally:
            os.environ["ETHEREUM_NETWORK"] = "ganache"
