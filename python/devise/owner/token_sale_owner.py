from devise.base import costs_gas
from devise.clients.token_sale import TokenSale


class TokenSaleOwner(TokenSale):
    @costs_gas
    def add_to_whitelist(self, client):
        """
        Add a client to the token sale white list
        :param client: The address of the client to be added
        :return:
        """
        tx_receipt = self._transact(self._token_sale_contract.functions.addToWhitelist(client), {"from": self.address})
        self.logger.info("Adding address %s to the white list", client)
        return tx_receipt

    @costs_gas
    def remove_from_whitelist(self, client):
        """
        Remove a client from the token sale white list
        :param client: The address of the client to be removed
        :return:
        """
        tx_receipt = self._transact(
            self._token_sale_contract.functions.removeFromWhitelist(client), {"from": self.address})
        self.logger.info("Removing address %s from the white list", client)
        return tx_receipt
