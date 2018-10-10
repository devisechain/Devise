//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./OwnedUpgradeabilityProxy.sol";
import "./AuctionStorage.sol";
import "./DeviseToken.sol";


/**
 * @title AuctionProxy
 * @dev entry point for auction logic.
 * This proxy allows us to upgrade the auction logic through an upgradeTo method.
 */
contract AuctionProxy is OwnedUpgradeabilityProxy, Ownable {
    constructor() public {
        setUpgradeabilityOwner(msg.sender);
        owner = msg.sender;
    }
}