//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./OwnedUpgradeabilityProxy.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./AccessControlImplStorage.sol";


/**
 * @title AccessControlProxy
 * @dev entry point for all access control logic.
 * This proxy allows us to upgrade the access control logic through an upgradeTo method.
 */
contract AccessControlProxy is OwnedUpgradeabilityProxy, AccessControlImplStorage, Ownable {
    constructor(DateTime dateTime, LeptonStorage leptonStorage_, AccessControlStorage acStorage_, AuctionStorage auctionStorage_) public {
        dateUtils = dateTime;
        acStorage = acStorage_;
        auctionStorage = auctionStorage_;
        leptonStorage = leptonStorage_;
    }
}
