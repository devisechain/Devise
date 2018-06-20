pragma solidity ^0.4.19;

import "./GroveLib.sol";


contract GroveBid {
    // accessible from derived contract
    GroveLib.Index internal index;

    function getIndexRoot() public view returns (bytes32) {
        return index.root;
    }

    function getIndexMax() public view returns (bytes32) {
        return index.maxId;
    }

    function getPreviousNode(bytes32 curNode) public view returns (bytes32) {
        return GroveLib.getPreviousNode(index, curNode);
    }

    function query(bytes2 operator, uint pricePerBit) public view returns (bytes32) {
        return GroveLib.query(index, operator, pricePerBit);
    }

    function getNodeValueBid(bytes32 curNode) public view returns (address, uint8, uint) {
        return GroveLib.getNodeValueBid(index, curNode);
    }

    function getNodeValueSeats(bytes32 curNode) public view returns (uint8) {
        address client;
        uint8 seats;
        uint pricePerBit;
        (client, seats, pricePerBit) = GroveLib.getNodeValueBid(index, curNode);
        return seats;
    }

    function getNodeValueAddress(bytes32 curNode) public view returns (address) {
        address client;
        uint8 seats;
        uint pricePerBit;
        (client, seats, pricePerBit) = GroveLib.getNodeValueBid(index, curNode);
        return seats;
    }

    function insertEx(bytes32 id, address client, uint8 seats, uint pricePerBit) internal {
        GroveLib.insert(index, id, client, seats, pricePerBit);
    }

    function removeEx(bytes32 id) internal {
        GroveLib.remove(index, id);
    }
}
