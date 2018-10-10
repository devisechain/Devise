//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./DateTime.sol";
import "./AccountingImpl.sol";
import "./AuctionImpl.sol";
import "./LeptonStorage.sol";
import "./AccessControlStorage.sol";
import "./AuctionStorage.sol";


/**
 * @title AccessControlImplStorage
 * @dev This is the parent storage interface for the AccessControlProxy and AccessControl implementation contracts.
 */
contract AccessControlImplStorage {
    // the maximum percentage of total seats that one client can rent
    uint internal maxSeatPercentage = 100;
    uint internal maxSeatMultiple = 100 / maxSeatPercentage;
    uint8 internal usefulnessDecimals = 6;
    uint32 internal usefulnessBaseline = uint32(10 ** uint256(usefulnessDecimals));
    // minimum price per bit, 1,000 DVZ, 6 decimals
    uint public minimumPricePerBit = 10 ** 3 * 10 ** 6;
    // total number of seats that can be rented in any lease term
    uint8 public totalSeats = 100;

    // The storage contract containing renters and prices
    DateTime public dateUtils;
    AccessControlStorage public acStorage;
    AuctionStorage public auctionStorage;
    LeptonStorage public leptonStorage;
    // auction and accounting contracts
    Auction public auction;
    Accounting public accounting;
}
