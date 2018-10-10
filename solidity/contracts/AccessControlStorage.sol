//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./AuthorizedOnly.sol";


/**
 * @title AccessControlStorage
 * @dev Standalone contract containing the access control state, including current renters, seat allocations, lease
 * terms, and price history per lease term.
 */
contract AccessControlStorage is AuthorizedOnly {
    struct Price {
        uint pricePerBitOfIU;
        uint totalIncrementalUsefulness;
        uint leaseTerm;
    }

    // current renter status mapping
    mapping(address => uint) internal rentersIndex;
    address[] internal renters;
    // a mapping from a client to the number of seats currently allocated
    mapping(address => uint8) internal currentTermSeats;
    // currently available number of seats
    uint8 public seatsAvailable = 100;
    // the current lease term index (starting from the genesis month/year)
    uint internal constant GENESIS_YEAR = 2018;
    uint internal constant GENESIS_MONTH = 1;
    uint public leaseTerm = 0;
    // a mapping of leaseTerms to price structs
    mapping(uint => Price) internal prices;

    constructor() public {
        owner = msg.sender;
        seatsAvailable = 100;
    }

    function isRenter(address client) public view returns (bool) {
        return rentersIndex[client] != 0;
    }

    function getRenter(uint index) public view returns (address) {
        return renters[index];
    }

    function getNumberOfRenters() public view returns (uint) {
        return renters.length;
    }

    function getCurrentTermSeats(address client) public view returns (uint8) {
        return currentTermSeats[client];
    }

    function getSeatsAvailable() public view returns (uint8) {
        return seatsAvailable;
    }

    function setCurrentTermSeats(address client, uint8 seats) public onlyAuthorized {
        seatsAvailable += getCurrentTermSeats(client);
        if (seats == 0)
            removeRenter(client);
        else {
            seatsAvailable -= seats;
            addRenter(client, seats);
        }
    }

    function getAllRenters() public view returns (address[]) {
        return renters;
    }

    /// @dev returns the price structure for the given lease term index
    function getPriceForTerm(uint leaseTerm_) public view returns (uint price, uint totalIncrementalUsefulness) {
        return (prices[leaseTerm_].pricePerBitOfIU, prices[leaseTerm_].totalIncrementalUsefulness);
    }

    function getCurrentLeaseTerm() public view returns (uint) {
        return leaseTerm;
    }

    function setCurrentLeaseTerm(uint leaseTerm_) public onlyAuthorized {
        leaseTerm = leaseTerm_;
    }

    function getPriceCurrentTerm() public view returns (uint price, uint totalIncrementalUsefulness) {
        return getPriceForTerm(leaseTerm);
    }

    function getPriceNextTerm() public view returns (uint price, uint totalIncrementalUsefulness) {
        return getPriceForTerm(leaseTerm + 1);
    }

    function setPriceForTerm(uint leaseTerm_, uint pricePerBit, uint totalIncrementalUsefulness) public onlyAuthorized {
        prices[leaseTerm_].pricePerBitOfIU = pricePerBit;
        prices[leaseTerm_].totalIncrementalUsefulness = totalIncrementalUsefulness;
    }

    /// @dev calculates the index of the current lease term relative to genesis month and year
    function calculateLeaseTerm(uint _year, uint _month) public pure returns (uint) {
        return (_year - GENESIS_YEAR) * 12 + _month - GENESIS_MONTH;
    }

    function addRenter(address client, uint8 seats) internal {
        if (rentersIndex[client] == 0) {
            renters.push(client);
            rentersIndex[client] = renters.length;
        }
        currentTermSeats[client] = seats;
    }

    function removeRenter(address client) internal {
        if (rentersIndex[client] != 0) {
            uint index = rentersIndex[client] - 1;
            if (renters.length > 1) {
                // move last renter into this renter's index and update its index
                renters[index] = renters[renters.length - 1];
                rentersIndex[renters[index]] = index + 1;
                // recover gas
                delete renters[renters.length - 1];
            }

            renters.length = renters.length - 1;
            rentersIndex[client] = 0;
            currentTermSeats[client] = 0;
        }
    }
}
