# References:
# https://github.com/LedgerHQ/blue-app-eth
# https://github.com/bargst/pyethoff
import struct

from ledgerblue.comm import getDongle

ETHEREUM_PATH_PREFIX = "44'/60'/0'/"


class LedgerWallet:
    """
    """

    def __init__(self):
        self.dongle = getDongle(debug=False)

    def _parse_bip32_path(self, account_index):
        """
        Use an index to account to retrieve the internal
        path for the key
        """
        path = ETHEREUM_PATH_PREFIX + str(account_index)
        result = bytes()
        elements = path.split('/')
        for pathElement in elements:
            element = pathElement.split("'")
            if len(element) == 1:
                result = result + struct.pack(">I", int(element[0]))
            else:
                result = result + struct.pack(">I", 0x80000000 | int(element[0]))
        return result

    def _exchange(self, donglePath, rlp_encoded_tx=None):
        if rlp_encoded_tx is None:
            apdu = bytes.fromhex('e0020000')
            apdu += bytes([len(donglePath) + 1])
        else:
            apdu = bytes.fromhex('e0040000')
            apdu += bytes([len(donglePath) + 1 + len(rlp_encoded_tx)])
        apdu += bytes([len(donglePath) // 4])
        apdu += donglePath
        if rlp_encoded_tx is not None:
            apdu += rlp_encoded_tx
        result = self.dongle.exchange(apdu, timeout=60)
        return result

    def get_address(self, account_index):
        """
        Query the ledger device for a public ethereum address.
        account_index is the number in the HD wallet tree
        """
        donglePath = self._parse_bip32_path(account_index)

        result = self._exchange(donglePath)

        # Parse result
        offset = 1 + result[0]
        address = result[offset + 1: offset + 1 + result[offset]]

        return '0x' + address.decode()

    def get_account_index(self, address):
        """
        Convert an address to an account index
        """
        account_index = 0
        status = address != self.get_address(account_index)
        while status:
            account_index += 1
            status = address != self.get_address(account_index)

        return account_index

    def sign(self, rlp_encoded_tx, account_index=None, address=''):
        """
        Sign an RLP encoded transaction
        """
        if account_index is None:
            # Convert an address to an offset
            if address == '':
                raise Exception('Invalid offset and address provided')
            else:
                account_index = self.get_account_index(address)

        donglePath = self._parse_bip32_path(account_index)

        result = self._exchange(donglePath, rlp_encoded_tx)

        # Retrieve VRS from sig
        v = result[0]
        r = int.from_bytes(result[1:1 + 32], 'big')
        s = int.from_bytes(result[1 + 32: 1 + 32 + 32], 'big')

        return (v, r, s)
