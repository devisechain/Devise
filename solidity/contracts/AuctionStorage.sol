pragma solidity ^0.4.19;

import "./GroveLib.sol";
import "./AuthorizedOnly.sol";


/**
 * @title AuctionStorage
 * @dev Standalone contract containing the bidding tree which maintains the structure of bids in descending limit price
 * order
 */
contract AuctionStorage is AuthorizedOnly {
    GroveLib.Index internal index;

    function getIndexRoot() public view returns (address) {
        return index.root;
    }

    function getIndexMax() public view returns (address) {
        return index.maxId;
    }

    /// @dev Get the number of bids in the tree
    function getNodeCount() public view returns (uint) {
        return index.nodeCount;
    }

    function getPreviousNode(address curNode) public view returns (address) {
        return GroveLib.getPreviousNode(index, curNode);
    }

    function query(bytes2 operator, uint pricePerBit) public view returns (address) {
        return GroveLib.query(index, operator, pricePerBit);
    }

    function getNodeValue(address curNode) public view returns (address client, uint8 seats, uint limitPrice) {
        return GroveLib.getNodeValueBid(index, curNode);
    }

    function getNodeValueSeats(address curNode) public view returns (uint8) {
        address client;
        uint8 seats;
        uint pricePerBit;
        (client, seats, pricePerBit) = GroveLib.getNodeValueBid(index, curNode);
        return seats;
    }

    function getNodeValueAddress(address curNode) public view returns (address) {
        address client;
        uint8 seats;
        uint pricePerBit;
        (client, seats, pricePerBit) = GroveLib.getNodeValueBid(index, curNode);
        return client;
    }

    function insertBid(address client, uint8 seats, uint pricePerBitOfIU) public onlyAuthorized {
        GroveLib.insert(index, client, seats, pricePerBitOfIU);
    }

    function removeBid(address client) public onlyAuthorized {
        GroveLib.remove(index, client);
    }

}
