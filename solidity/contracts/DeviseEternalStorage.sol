pragma solidity ^0.4.19;

import "./GroveBid.sol";
import "./LeptonWarehouse.sol";


/// @title Permanent data store for key state variables
/// @author Pit.AI
contract DeviseEternalStorage is GroveBid, LeptonWarehouse {
    mapping(address => bool) internal authorized;
    address internal owner;

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert();
        _;
    }

    modifier onlyOwner() {
        if (owner != msg.sender) revert();
        _;
    }

    function DeviseEternalStorage() public {
        owner = msg.sender;
    }

    function authorize(address addr) public onlyOwner {
        authorized[addr] = true;
    }

    function unauthorize(address addr) public onlyOwner {
        authorized[addr] = false;
    }

    // Grove related interfaces
    function insert(bytes32 id, address client, uint8 seats, uint pricePerBitOfIU) public onlyAuthorized {
        insertEx(id, client, seats, pricePerBitOfIU);
    }

    function remove(bytes32 id) public onlyAuthorized {
        removeEx(id);
    }

    // LeptonWarehouse related interfaces
    function addLepton(string _lepton, uint _usefulness) public onlyAuthorized {
        addLeptonEx(_lepton, _usefulness);
    }
}
