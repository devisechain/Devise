//noinspection WarnInspections
pragma solidity ^0.4.23;

import "./AccessControlStorage.sol";
import "./AccountingImpl.sol";
import "./AuctionImpl.sol";
import "./LeptonStorage.sol";
import "./AccessControlImplStorage.sol";
import "./AuctionStorage.sol";


/**
 * @title AccessControl
 * @dev This contract controls access to the block chain by maintaining a list of current renters and their allocated
 * seats as well as the price history for each lease term.
 */
contract AccessControl is AccessControlImplStorage, Ownable, Pausable, AuthorizedOnly {
    using SafeMath for uint256;

    event RenterAdded(address client);
    event RenterRemoved(address client);
    event DataContractChanged(address addr);
    event FeeChanged(string src, uint amt);
    event TotalSeatsChanged(uint8 s);
    event MaxSeatsPerAddressChanged(uint ts);
    event LeasePriceCalculated(uint leaseTerm, uint256 prc, uint all);
    event AuctionPriceSet(uint256 leaseTerm, uint256 prc);
    event LeaseTermUpdated(uint lt);
    event IncrementalUsefulnessPrecisionChanged(uint32 prec);
    event BidCanceled(address client);
    event BidUpdated(address client, uint8 seats, uint limitPrice);

    /// @dev sets the current accounting contract
    function setAccountingContract(Accounting accounting_) public onlyOwner {
        accounting = accounting_;
    }

    /// @dev sets the current accounting contract
    function setAuctionContract(Auction auction_) public onlyOwner {
        auction = auction_;
    }

    /// @dev sets the leptons storage contract
    function setLeptonStorage(LeptonStorage leptonStorage_) public onlyOwner {
        leptonStorage = leptonStorage_;
    }

    /// @dev sets the current accounting contract
    function setLeaseStorageContract(AccessControlStorage leaseStorage_) public onlyOwner {
        acStorage = leaseStorage_;
    }

    /// @dev set data contract
    function setAuctionStorageContract(AuctionStorage auctionStorage_) public onlyOwner {
        auctionStorage = auctionStorage_;
        DataContractChanged(auctionStorage);
    }

    /// @notice Adds a bid to the current auction
    /// @param limitPrice The limit price bid for this client
    /// @param seats The number of seats wanted by this client
    /// @param client The client's address
    function updateClientBid(uint limitPrice, uint8 seats, address client) public onlyAuthorized {
        if (seats > 0) {
            auctionStorage.insertBid(client, seats, limitPrice);
            emit BidUpdated(client, seats, limitPrice);
        } else {
            auctionStorage.removeBid(client);
            emit BidCanceled(client);
        }
    }

    /// @dev gets the client's current bid from the bid tree
    function getClientBid(address client) public view returns (address client_, uint8 seats, uint limitPrice) {
        return auctionStorage.getNodeValue(client);
    }

    /// Get all bids from the bid grove
    /// @return address[] bidders, uint8[] seats, uint[] bids
    function getAllBidders() public view returns (address[] memory bidders, uint8[] memory seatsRequested,
        uint[] memory limitPrices) {
        // Get number of bids in the grove so we can build our fixed sized memory arrays
        uint numberOfBids = auctionStorage.getNodeCount();
        address curNode = auctionStorage.getIndexMax();
        address pNode;

        // create fixed sized memory arrays
        bidders = new address[](numberOfBids);
        seatsRequested = new uint8[](numberOfBids);
        limitPrices = new uint[](numberOfBids);
        // populate arrays from grove
        curNode = auctionStorage.getIndexMax();
        uint idx = 0;
        while (curNode != 0x0) {
            var (client, bidSeats, pricePerBit) = auctionStorage.getNodeValue(curNode);
            if (bidSeats > 0) {
                bidders[idx] = client;
                seatsRequested[idx] = bidSeats;
                limitPrices[idx] = pricePerBit;
                idx++;
            }
            pNode = auctionStorage.getPreviousNode(curNode);
            curNode = pNode != 0x0 ? pNode : address(0x0);
        }

        return (bidders, seatsRequested, limitPrices);
    }


    function getPricePerBitCurrentTerm() public view returns (uint) {
        uint pricePerBit;
        (pricePerBit,) = acStorage.getPriceCurrentTerm();
        pricePerBit = max(pricePerBit, minimumPricePerBit);
        return pricePerBit;
    }

    /// @notice Get the prevailing price for the current lease term
    function getRentPerSeatCurrentTerm() public view returns (uint) {
        uint pricePerBit;
        uint iu;
        (pricePerBit, iu) = acStorage.getPriceCurrentTerm();
        pricePerBit = max(pricePerBit, minimumPricePerBit);
        uint totalIU = iu > 0 ? iu : leptonStorage.totalIncrementalUsefulness();
        uint totalPrice = pricePerBit.mul(totalIU).div(usefulnessBaseline);
        return totalPrice;
    }

    function getIndicativePricePerBitNextTerm() public view returns (uint) {
        uint iu = leptonStorage.totalIncrementalUsefulness();
        //noinspection ErrorInspections
        var (price,,) = updateLeasePriceForNextTerm(acStorage.getCurrentLeaseTerm() + 1, iu);
        return price;
    }

    /// @notice Get the current prevailing price for the next lease term
    function getIndicativeRentPerSeatNextTerm() public view returns (uint) {
        uint price = getIndicativePricePerBitNextTerm();
        uint iu = leptonStorage.totalIncrementalUsefulness();
        return price.mul(iu).div(usefulnessBaseline);
    }

    /// @notice Bid for a number of seats up to a limit price per bit of information
    function leaseAll(address client, uint limitPrice, uint8 seats) public whenNotPaused onlyAuthorized {
        // check that client has enough tokens provisioned
        uint allowance = accounting.getAllowance(client);
        if (allowance == 0 || (limitPrice < minimumPricePerBit && seats > 0))
            revert();
        // Update this client's bid in the bid tree
        updateClientBid(limitPrice, seats, client);
        if (seats > 0) {
            // if client is asking for more than max seats per client, restrict to max
            uint8 seats_ = totalSeats / seats >= maxSeatMultiple ? seats : uint8(totalSeats / maxSeatMultiple);
            // add client to current term and deduct prorated price if seats available
            acceptClientBid(client, limitPrice, seats_);
        }
    }

    /// @notice Get the number of currently active renters
    function getNumberOfRenters() public view returns (uint) {
        return acStorage.getNumberOfRenters();
    }

    /// @notice Get the renter address at `(index)`
    /// @param index the index for which to return the renter address
    function getRenter(uint index) public view returns (address) {
        return acStorage.getRenter(index);
    }

    /// Get all renter addresses
    /// @return address[]
    function getAllRenters() public view returns (address[]) {
        return acStorage.getAllRenters();
    }

    /// @notice Get the current number of seats awarded to the sender for the current lease term
    function getCurrentTermSeats(address client) public view returns (uint8) {
        return acStorage.getCurrentTermSeats(client);
    }

    /// @notice Get the expected number of seats awarded to the sender for next term based on current IU and bids
    function getNextTermSeats(address client) public view returns (uint8) {
        uint iu = leptonStorage.totalIncrementalUsefulness();
        uint lt = acStorage.getCurrentLeaseTerm();
        var (price, bidders, allocatedSeats) = updateLeasePriceForNextTerm(lt + 1, iu);
        acStorage.setCurrentLeaseTerm(lt + 1);
        updateRentersList(bidders, allocatedSeats, price, lt + 1);
        return acStorage.getCurrentTermSeats(client);
    }

    /// @notice get the current lease term number
    function getCurrentLeaseTerm() public view returns (uint) {
        return acStorage.getCurrentLeaseTerm();
    }

    /// @notice Get number of currently available seats for the current lease term
    function getSeatsAvailable() public view returns (uint8) {
        return acStorage.getSeatsAvailable();
    }

    /// @notice Used by owner to set the usefulness baseline
    function setUsefulnessBaseline(uint8 dec) public onlyAuthorized {
        require(dec <= 9);
        usefulnessDecimals = dec;
        usefulnessBaseline = uint32(10 ** uint256(usefulnessDecimals));
        IncrementalUsefulnessPrecisionChanged(usefulnessBaseline);
    }

    /// @notice Returns the usefulness baseline
    function getUsefulnessBaseline() public view returns (uint) {
        return usefulnessBaseline;
    }

    /// @notice Used by owner to set minimum price per bit of incremental usefulness
    function setMinimumPricePerBit(uint amount) public onlyAuthorized {
        minimumPricePerBit = amount;
        FeeChanged("Minimum Price Per Bit", minimumPricePerBit);
    }

    /// @notice Used by owner to set total seats available
    function setTotalSeats(uint8 amount) public onlyAuthorized {
        totalSeats = amount;
        TotalSeatsChanged(totalSeats);
    }

    /// @notice Used by owner to set max percentage of seats occupied by a client
    function setMaxSeatPercentage(uint amount) public onlyAuthorized {
        require(amount <= 100);
        maxSeatPercentage = amount;
        maxSeatMultiple = 100 / maxSeatPercentage;
        MaxSeatsPerAddressChanged(maxSeatPercentage);
    }

    // @notice The maximum percentage of seats on client may lease
    function getMaxSeatPercentage() public view returns (uint, uint) {
        return (maxSeatPercentage, maxSeatMultiple);
    }

    /// @dev This is the main contract state updater. It catches up the lease terms by running the auction price logic
    /// for each past and current lease term since the last closed auction. For each lease term, renter balances are
    /// updated to reflect the rent paid for that term so that following auctions are based on accurate escrow balances.
    function updateGlobalState() public whenNotPaused onlyAuthorized {
        uint lt = getLeaseTermForCurrentTime();
        uint lastUpdatedLeaseTerm = acStorage.getCurrentLeaseTerm();
        if (lastUpdatedLeaseTerm < lt) {
            uint totalIU = leptonStorage.totalIncrementalUsefulness();
            uint price = minimumPricePerBit;
            address[] memory bidders;
            uint8[] memory allocatedSeats;
            for (uint i = lastUpdatedLeaseTerm + 1; i <= lt; i++) {
                // calculate current term auction price per bit
                if (totalIU > 0) {
                    (price, bidders, allocatedSeats) = updateLeasePriceForNextTerm(i, totalIU);
                    updateRentersList(bidders, allocatedSeats, price, i);
                }
                emit LeasePriceCalculated(i, price, price.mul(totalIU));
                // set the price for the current term
                acStorage.setPriceForTerm(i, price, totalIU);
                emit AuctionPriceSet(i, price);
                acStorage.setCurrentLeaseTerm(i);
                emit LeaseTermUpdated(i);
            }
        }
        accounting.updatePowerUserMin(getRentPerSeatCurrentTerm());
    }

    /// @notice Finalizes the auction price for the next term
    function updateLeasePriceForNextTerm(uint lt, uint totalIncrementalUsefulness) internal returns (uint, address[],
        uint8[]) {
        var (bidders, seats, limitPrices) = getAllQualifiedBids();
        var (price, allocatedSeats) = auction.calculateAuctionPrice(seats, limitPrices, totalSeats, minimumPricePerBit);
        if (price < minimumPricePerBit)
            price = minimumPricePerBit;
        return (price, bidders, allocatedSeats);
    }

    function acceptClientBid(address client, uint _bid, uint8 _seats) internal {
        uint8 currentTermSeats = acStorage.getCurrentTermSeats(client);
        // seats are less or the same than current seats, no need to do anything here
        if (_seats <= currentTermSeats)
            return;

        // how many seats can this client get now?
        uint8 _extraSeats = _seats - currentTermSeats;

        // are there seats available for this client's request
        uint8 seats = _extraSeats <= getSeatsAvailable() ? _extraSeats : getSeatsAvailable();

        // if this client is eligible and wants more seats, charge her the extra rent for the new seats
        uint pricePerBit;
        (pricePerBit,) = acStorage.getPriceCurrentTerm();
        pricePerBit = max(pricePerBit, minimumPricePerBit);
        if (_bid >= pricePerBit && seats > 0) {
            if (!acStorage.isRenter(client))
                RenterAdded(client);
            uint proratedRent = calculateProratedRent(seats);
            accounting.deductRent(client, proratedRent, acStorage.getCurrentLeaseTerm());
            acStorage.setCurrentTermSeats(client, currentTermSeats + seats);
        }
    }

    function calculateProratedRent(uint seats) internal returns (uint) {
        // if the user is not requesting more seats
        if (seats <= 0)
            return 0;

        uint pricePerBit;
        uint totalIU;
        (pricePerBit, totalIU) = acStorage.getPriceCurrentTerm();
        pricePerBit = max(pricePerBit, minimumPricePerBit);
        totalIU = totalIU > 0 ? totalIU : leptonStorage.totalIncrementalUsefulness();
        uint decimals = 8;

        // calculate prorated current term dues and deduct from allowance
        uint year;
        uint month;
        uint day;
        (year, month, day) = getCurrentDate();
        uint mDays = dateUtils.getDaysInMonth(uint8(month), uint16(year));
        uint rent = pricePerBit.mul(totalIU).div(usefulnessBaseline);
        uint256 fullRent = rent.mul(seats).mul(10 ** decimals);
        uint daysDue = mDays - (day - 1);
        return fullRent.mul(daysDue).div(mDays).div(10 ** decimals);
    }

    /// @dev calculates the rent due for a client based on the seats allocated
    function calculateRenterDues(uint price, uint iu, address _client) internal returns (uint) {
        uint totalPrice = price.mul(iu).div(usefulnessBaseline);
        return totalPrice.mul(acStorage.getCurrentTermSeats(_client));
    }

    function updateRentersList(address[] qualifiedBidders, uint8[] allocatedSeats, uint price, uint leaseTerm)
    internal {
        // temp variables
        uint index;
        uint totalIU = leptonStorage.totalIncrementalUsefulness();

        // remove seats from existing renters that are no longer bidders or can't afford their bids
        address[] memory renters = acStorage.getAllRenters();
        for (index = 0; index < renters.length; index++) {
            var (client, seats, limitPrice) = getClientBid(renters[index]);
            if (seats == 0 || !isQualifiedBidder(client, seats, limitPrice, totalIU)) {
                acStorage.setCurrentTermSeats(client, 0);
                emit RenterRemoved(client);
            }
        }

        // Apply allocated seats to everyone who should have any
        uint rent = price.mul(totalIU).div(usefulnessBaseline);
        for (index = 0; index < qualifiedBidders.length; index++) {
            uint currentSeats = acStorage.getCurrentTermSeats(qualifiedBidders[index]);
            // if this client's seat allocation changed from last term, update our records and emit events
            if (allocatedSeats[index] != currentSeats) {
                acStorage.setCurrentTermSeats(qualifiedBidders[index], allocatedSeats[index]);
                if (currentSeats == 0 && allocatedSeats[index] != 0)
                    emit RenterAdded(qualifiedBidders[index]);
                if (currentSeats != 0 && allocatedSeats[index] == 0)
                    emit RenterRemoved(qualifiedBidders[index]);
            }
            if (allocatedSeats[index] > 0) {
                // charge each client for the number of seats then won
                accounting.deductRent(qualifiedBidders[index], rent.mul(allocatedSeats[index]), leaseTerm);
            }
        }
    }

    function getAllQualifiedBids() internal returns (address[] memory qBidders, uint8[] memory qSeats,
        uint[] memory qBids) {
        uint totalIU = leptonStorage.totalIncrementalUsefulness();
        var (bidders, seats, limitPrices) = getAllBidders();
        qBidders = new address[](bidders.length);
        qSeats = new uint8[](bidders.length);
        qBids = new uint[](bidders.length);
        uint newIndex = 0;
        for (uint index; index < bidders.length; index++) {
            if (isQualifiedBidder(bidders[index], seats[index], limitPrices[index], totalIU)) {
                qBidders[newIndex] = bidders[index];
                qSeats[newIndex] = seats[index];
                qBids[newIndex] = limitPrices[index];
                newIndex++;
            }
        }
        return (qBidders, qSeats, qBids);
    }

    function isQualifiedBidder(address client, uint8 seats, uint limitPrice, uint totalIU) internal returns (bool) {
        uint dues = limitPrice.mul(totalIU).div(usefulnessBaseline).mul(seats);
        uint currentBalance = accounting.getAllowance(client);
        return dues <= currentBalance;
    }

    /// @notice Converts a timestamp to (year, month, day)
    /// @return (uint _year, uint _month, uint _day)
    function getCurrentDate() internal returns (uint _year, uint _month, uint _day) {
        uint _timestamp = block.timestamp;
        uint year = dateUtils.getYear(_timestamp);
        uint month = dateUtils.getMonth(_timestamp);
        uint day = dateUtils.getDay(_timestamp);
        return (year, month, day);
    }

    /// @dev returns the lease term index for the current block timestamp
    function getLeaseTermForCurrentTime() internal returns (uint) {
        uint year;
        uint month;
        (year, month,) = getCurrentDate();
        return acStorage.calculateLeaseTerm(year, month);
    }

    function max(uint a, uint b) private pure returns (uint) {
        return a > b ? a : b;
    }
}