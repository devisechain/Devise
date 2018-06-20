import os

import pytest
from ledgerblue.commException import CommException

from devise.ledger import LedgerWallet


class TestLedgerWallet(object):
    @pytest.mark.skipif(os.environ.get("JENKINS_BUILD", False),
                        reason="Jenkins cannot access a ledger hardware wallet!")
    def test_account_index(self):
        ledger = None
        try:
            ledger = LedgerWallet()
        except CommException:
            pytest.skip('Ledger nano dongle not found!')

        index = ledger.get_account_index('0xc5b7e45ba600324868a0c86a567b902dc35f0958ca46fb86dcaf352f12e6d913')
        assert index == 0
