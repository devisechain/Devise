//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./DeviseToken.sol";
import "./AccountingStorage.sol";


/**
 * @title AccountingImplStorage
 * @dev Parent storage class for AccountingProxy and AccountingImpl.
 */
contract AccountingImplStorage {
    DeviseToken internal token;
    AccountingStorage public accountingStorage;

    address public escrowWallet;
    address public revenueWallet;
    uint internal powerUserClubFee = 0;
    uint internal historicalDataFee = 0;
    uint internal constant INIT_POWER_USER_MIN = 0;
    uint internal powerUserMinimum = INIT_POWER_USER_MIN;
}
