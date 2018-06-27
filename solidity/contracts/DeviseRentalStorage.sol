pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./DateTime.sol";
import "./DeviseEternalStorage.sol";
import "./DeviseToken.sol";


contract DeviseRentalStorage {
    // Version name of the current implementation
    string internal _version;

    // Address of the current implementation
    address internal _implementation;

    struct Allowance {
        uint balance;
        uint leaseTermPaid;
        bool isPowerUser;
        bool canAccessHistoricalData;
    }

    struct Price {
        uint pricePerBitOfIU;
        uint priceForAllLeptons;
        uint totalIncrementalUsefulness;
    }

    struct Client {
        bool isClient;
        uint limitPrice;
        uint8 seats;
        address beneficiary;
        Allowance allowance;
    }

    uint public totalIncrementalUsefulness;
    address public owner;
    bool public paused = false;
    address public escrowWallet;
    address public revenueWallet;

    uint internal constant GENESIS_YEAR = 2018;
    // for production, change GENESIS_MONTH to 3
    // for testing purposes, set it to 1
    uint internal constant GENESIS_MONTH = 1;
    uint internal constant INIT_POWER_USER_MIN = 0;
    uint internal powerUserMinimum = INIT_POWER_USER_MIN;
    uint8 internal usefulnessDecimals = 6;
    uint32 internal usefulnessBaseline = uint32(10 ** uint256(usefulnessDecimals));
    // minimum price per bit, 1,000 DVZ, 6 decimals
    uint public minimumPricePerBit = 10 ** 3 * 10 ** 6;
    uint8 public totalSeats = 100;
    uint internal maxSeatPercentage = 100;
    uint internal powerUserClubFee = 0;
    uint internal historicalDataFee = 0;
    uint internal maxSeatMultiple = 100 / maxSeatPercentage;

    uint public leaseTerm;
    Price internal priceCurrentTerm;

    uint8 public seatsAvailable;
    Price internal priceNextTerm;

    mapping(address => Client) internal clients;
    address[] internal clientsArray;
    // a mapping from a client to the number of seats currently allocated
    mapping(address => uint8) internal auctionSeats;
    // current renter status mapping
    mapping(address => bool) internal clientsAsRenters;
    address[] internal currentRenters;
    // an array of lepton prices to loop through
    mapping(uint => Price) internal priceHistory;

    DeviseToken internal token;
    DateTime internal dateUtils;
    DeviseEternalStorage internal permData;
}