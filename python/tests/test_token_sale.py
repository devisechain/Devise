from datetime import datetime

import pytest

from .utils import evm_snapshot, evm_revert


class TestTokenSale(object):
    @pytest.fixture(scope="function", autouse=True)
    def setup_method(self, token_sale_client, token_client):
        self.token_sale_client = token_sale_client
        self.token_client = token_client
        self.snapshot_id = evm_snapshot(token_sale_client)

    def teardown_method(self, method):
        self.snapshot_id = evm_revert(self.snapshot_id, self.token_sale_client)

    def test_opening_time(self):
        dt = self.token_sale_client.opening_time
        assert dt == datetime(2018, 4, 30, 17, 0)

    def test_closing_time(self):
        dt = self.token_sale_client.closing_time
        assert dt == datetime(2019, 9, 30, 17, 0)

    def test_eth_dvz_rate(self):
        rate = self.token_sale_client.eth_dvz_rate
        assert rate < 16000 and rate > 8000

    def test_has_closed(self):
        status = self.token_sale_client.has_closed()
        assert status == False

    def test_remaining_tokens(self):
        tokens = self.token_sale_client.remaining_tokens
        assert 0 <= tokens <= 1e9

    def test_ether_cost(self):
        cost = self.token_sale_client.ether_cost(dvz=16000)
        assert cost >= 1

    def test_buy_tokens(self):
        tokens = 1234567
        status = self.token_sale_client.buy_tokens(tokens)
        assert status == True
        bal = self.token_client.balance_of(self.token_client.address)
        assert bal >= tokens and round(bal - tokens, 6) <= 0.000001

    def test_buy_usd_worth_of_tokens(self):
        usd = 10000
        status = self.token_sale_client.buy_usd_worth_of_tokens(usd)
        assert status == True
        bal = self.token_client.balance_of(self.token_client.address)
        assert bal >= 0

    def test_add_to_whitelist(self, token_sale_owner, client):
        status = self.token_sale_client.is_on_whitelist(client.address)
        assert status == False
        token_sale_owner.add_to_whitelist(client.address)
        status = self.token_sale_client.is_on_whitelist(client.address)
        assert status == True

    def test_remove_from_whitelist(self, token_sale_owner, client):
        token_sale_owner.add_to_whitelist(client.address)
        status = self.token_sale_client.is_on_whitelist(client.address)
        assert status == True
        token_sale_owner.remove_from_whitelist(client.address)
        status = self.token_sale_client.is_on_whitelist(client.address)
        assert status == False
