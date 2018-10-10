//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./OwnedUpgradeabilityProxy.sol";
import "./DeviseToken.sol";
import "./AccountingStorage.sol";
import "./AccountingStorage.sol";
import "./AccountingImplStorage.sol";


/**
 * @title AccountingProxy
 * @dev entry point for all accounting logic.
 * This proxy allows us to upgrade the accounting logic through an upgradeTo method.
 */
contract AccountingProxy is OwnedUpgradeabilityProxy, AccountingImplStorage, Ownable {
    /// @dev proxy constructor, takes a token and storage contract address
    constructor(DeviseToken _token, AccountingStorage _accountingStorage) public {
        setUpgradeabilityOwner(msg.sender);
        owner = msg.sender;
        token = _token;
        accountingStorage = _accountingStorage;
    }
}

