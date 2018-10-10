//noinspection WarnInspections
pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./AuthorizedOnly.sol";


/**
 * @title Auction
 * @dev auction logic.
 * This contract calculates the auction price and seats given arrays of bids.
 */
contract Auction is Ownable, AuthorizedOnly {
    using SafeMath for uint;

    /// returns the auction price corresponding to the current state of the bids tree and current client escrow balances
    function calculateAuctionPrice(uint8[] bidderSeats, uint[] bidderLimitPrices, uint8 totalSeats, uint minimumPricePerBit) public view returns (uint, uint8[]) {
        // revenue so far
        uint rev;
        // revenue including current bidder
        uint winningPricePerBit = minimumPricePerBit;
        uint8[] memory allocatedSeats = new uint8[](bidderSeats.length);
        // total seats allocated so far
        uint8 seatsRented = 0;
        for (uint x = 0; x < bidderSeats.length; x++) {
            uint8 seats = bidderSeats[x];
            uint pricePerBit = bidderLimitPrices[x];

            // this bidder has enough to cover her bid, see if setting the price here maximizes revenue
            uint8 seatsAssignable = seatsRented + seats > totalSeats ? totalSeats - seatsRented : seats;
            if (seatsAssignable == 0 || pricePerBit * (seatsRented + seatsAssignable) < rev) {
                return (winningPricePerBit, allocatedSeats);
            }
            // allocate seats
            allocatedSeats[x] = seatsAssignable;
            seatsRented = seatsRented + seatsAssignable;
            rev = pricePerBit * seatsRented;
            // record new current best price
            winningPricePerBit = pricePerBit;
        }
        return (winningPricePerBit, allocatedSeats);
    }
}
