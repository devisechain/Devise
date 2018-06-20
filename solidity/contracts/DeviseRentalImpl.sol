pragma solidity ^0.4.23;

import "./DeviseRentalStorage.sol";


/// @title A lease contract for synthetic market representations
/// @author Pit.AI
contract DeviseRentalImpl is DeviseRentalStorage {
    using SafeMath for uint256;

    modifier require(bool _condition) {
        if (!_condition) revert();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert();
        _;
    }

    modifier whenPaused() {
        if (!paused) revert();
        _;
    }

    /* Events for DApps to listen to */
    event Leased(bool status);
    event CurrentAllowance(uint amount);
    event BalanceChanged(string direction, uint amount);
    event PowerUserStatus(bool status);
    event WalletChanged(string msg, address addr);
    event DataContractChanged(address addr);
    event BeneficiaryChanged(address addr, address ben);
    event StrategyAdded(string s, uint iu);
    event LeaseTermUpdated(uint lt);
    event FeeChanged(string src, uint amt);
    event IncrementalUsefulnessPrecisionChanged(uint32 prec);
    event TotalSeatsChanged(uint8 s);
    event MaxSeatsPerAddressChanged(uint ts);
    event LeasePriceCalculated(uint256 prc, uint256 all);
    event AuctionPriceSet(uint256 leaseTerm, uint256 prc);
    event RenterAdded(address client);
    event RenterRemoved(address client);
    event BidCanceled(address client);

    /// @notice set escrow wallet
    /// @param addr The address of the escrow wallet
    function setEscrowWallet(address addr) public onlyOwner
    require(owner != addr && revenueWallet != addr) {
        escrowWallet = addr;
        WalletChanged("The escrow wallet has been changed to ", escrowWallet);
    }

    /// @notice set revenue wallet
    /// @param addr The address of the revenue wallet
    function setRevenueWallet(address addr) public onlyOwner
    require(owner != addr && escrowWallet != addr) {
        revenueWallet = addr;
        WalletChanged("The revenue wallet has been changed to ", revenueWallet);
    }

    /// @notice get data contract address
    function getDataContract() public view returns (address) {
        return permData;
    }

    /// @notice set data contract
    /// @param _add The address of data contract
    function setDataContract(DeviseEternalStorage _add) public onlyOwner {
        permData = _add;
        DataContractChanged(permData);
    }

    /// @notice transfers `(_amount)` from the token contract to the internal ledger for use to pay for lease
    /// @param _amount The number of tokens to allow for payment of lease dues
    function provision(uint _amount) public whenNotPaused require(_amount > 0) require(escrowWallet != 0x0) {
        _updateLeaseTerms();
        token.transferFrom(msg.sender, escrowWallet, _amount);
        clients[msg.sender].allowance.balance = clients[msg.sender].allowance.balance.add(_amount);
        if (!clients[msg.sender].isClient) {
            clientsArray.push(msg.sender);
            clients[msg.sender].isClient = true;
        }
    }

    /// @notice Withdraw tokens back from the lease allowance to the Token contract
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint amount) public whenNotPaused {
        // Must update all auctions first to make sure allowance is correct
        _updateLeaseTerms();
        Allowance storage _allow = clients[msg.sender].allowance;
        if (_allow.balance >= amount) {
            _allow.balance = _allow.balance.sub(amount);
            token.transferFrom(escrowWallet, msg.sender, amount);
            BalanceChanged("decreased", amount);
            updatePowerUserStatus(msg.sender);
            CurrentAllowance(_allow.balance);
        }
    }

    /// @notice Designate an address to be authorized to consume the leased data on behalf of sender
    /// @param _beneficiary A beneficiary address
    function designateBeneficiary(address _beneficiary) public whenNotPaused {
        clients[msg.sender].beneficiary = _beneficiary;
        BeneficiaryChanged(msg.sender, _beneficiary);
    }

    /// @notice Get the beneficiary address designated by the current sender to receive the leased data
    function getBeneficiary() public view returns (address) {
        return clients[msg.sender].beneficiary != 0x0 ? clients[msg.sender].beneficiary : msg.sender;
    }

    /// @notice Get the money account address for which the current sender is a beneficiary
    function getClientForBeneficiary() public view returns (address) {
        for (uint clientIdx = 0; clientIdx < clientsArray.length; clientIdx++) {
            address clientAddress = clientsArray[clientIdx];
            Client client = clients[clientAddress];
            if (client.beneficiary == msg.sender)
                return clientAddress;
            if (clientAddress == msg.sender)
                return msg.sender;
        }
        return 0x0;
    }

    /// @notice Get the beneficiary address designated by the `(_client)` to receive the leased data
    /// @param _client the address of the client for which to return the beneficiary
    function getClientSummary(address _client) public view require(clients[_client].isClient)
    returns (address, uint, uint, uint, bool, bool, uint, uint) {
        _updateLeaseTerms();
        Client client = clients[_client];
        uint seats = auctionSeats[_client];
        uint nextSeats = _getNextTermSeats(_client);
        uint tokenBalance = token.balanceOf(_client);

        return (
        client.beneficiary != 0x0 ? client.beneficiary : _client,
        client.allowance.balance,
        tokenBalance,
        client.allowance.leaseTermPaid,
        client.allowance.isPowerUser,
        client.allowance.canAccessHistoricalData,
        seats,
        nextSeats
        );
    }

    /// @notice Updates and returns the current lease allowance in tokens of the `message.caller.address()`
    /// @return The allowance of the message sender
    function getAllowance() public view returns (uint amount) {
        _updateLeaseTerms();
        return clients[msg.sender].allowance.balance;
    }

    /// @notice Get the total incremental usefulness of the blockchain
    /// @return the total incremental usefulness of the blockchain
    function getTotalIncrementalUsefulness() public view returns (uint) {
        return totalIncrementalUsefulness;
    }

    function getPricePerBitCurrentTerm() public view returns (uint) {
        _updateLeaseTerms();
        uint price = priceCurrentTerm.pricePerBitOfIU;
        return price;
    }

    /// @notice Get the prevailing price for the current lease term
    function getRentPerSeatCurrentTerm() public view returns (uint) {
        _updateLeaseTerms();
        uint price = priceCurrentTerm.pricePerBitOfIU;
        uint totalIU = priceCurrentTerm.totalIncrementalUsefulness > 0 ? priceCurrentTerm.totalIncrementalUsefulness : totalIncrementalUsefulness;
        uint totalPrice = price.mul(totalIU).div(usefulnessBaseline);
        return totalPrice;
    }

    function getIndicativePricePerBitNextTerm() public view returns (uint) {
        _updateLeaseTerms();
        calculateLeasePriceForNextTerm(0);
        uint price = priceNextTerm.pricePerBitOfIU;
        return price;
    }

    /// @notice Get the current prevailing price for the next lease term
    function getIndicativeRentPerSeatNextTerm() public view returns (uint) {
        _updateLeaseTerms();
        return _updatePriceNextTerm();
    }

    /// @notice Add strategies to the be leased, to be called by the contract owners as strategies are mined and
    /// selected
    /// @param _strategy A sha1 strategy hash
    /// @param _incrementalUsefulness The incremental usefulness added by the strategy being added
    function addStrategy(string _strategy, uint _incrementalUsefulness) public onlyOwner require(_incrementalUsefulness > 0) {
        var (y, m,) = getCurrentDate();
        uint IUTerm = calculateLeaseTerm(y, m) + 1;
        if (IUTerm > leaseTerm + 1) {
            // Price incrementalUsefulness is to be changed for a term past next term, we need to catchup missing terms first
            _updateLeaseTerms();
        }
        permData.addStrategy(_strategy, _incrementalUsefulness);
        priceNextTerm.totalIncrementalUsefulness = totalIncrementalUsefulness = totalIncrementalUsefulness.add(_incrementalUsefulness);
        StrategyAdded(_strategy, _incrementalUsefulness);
    }

    /// @notice apply for access to power user only data
    function applyForPowerUser() public whenNotPaused returns (bool status) {
        _updateLeaseTerms();
        Allowance storage allow = clients[msg.sender].allowance;
        if (!allow.isPowerUser && allow.balance >= powerUserMinimum) {
            allow.isPowerUser = true;
            allow.balance = allow.balance.sub(powerUserClubFee);
            recognizeRevenue(powerUserClubFee);
            BalanceChanged("decreased", powerUserClubFee);
        }
        PowerUserStatus(allow.isPowerUser);
        return allow.isPowerUser;
    }

    /// @notice Check if `message.caller.address()` is a power user
    /// @return true if user is a power user, false otherwise
    function isPowerUser() public view returns (bool status) {
        _updateLeaseTerms();
        Allowance storage _allow = clients[msg.sender].allowance;
        return _allow.isPowerUser;
    }

    /// @notice Gain access to historical data download for all the strategies
    function requestHistoricalData() public whenNotPaused {
        _updateLeaseTerms();
        applyForPowerUser();
        Allowance storage _allow = clients[msg.sender].allowance;
        if (_allow.isPowerUser && !_allow.canAccessHistoricalData) {
            _allow.balance = _allow.balance.sub(historicalDataFee);
            recognizeRevenue(historicalDataFee);
            BalanceChanged("decreased", historicalDataFee);
            _allow.canAccessHistoricalData = true;
        }
    }

    /// @notice get the client with the current highest bid
    function getHighestBidder() public view returns (address, uint8, uint) {
        bytes32 nodeId = permData.getIndexMax();
        return permData.getNodeValueBid(nodeId);
    }

    /// @notice get the client with the highest bid after the current client
    /// @param _client the client after which to get the next highest bidder
    function getNextHighestBidder(address _client) public view returns (address, uint8, uint) {
        bytes32 nodeId = keccak256(_client);
        bytes32 pNode = permData.getPreviousNode(nodeId);
        if (pNode != 0x0) {
            return permData.getNodeValueBid(pNode);
        } else
            revert();
    }

    /// @notice Bid for a number of seats up to a limit price per bit of information
    function leaseAll(uint limitPrice, uint8 _seats) public whenNotPaused returns (bool) {
        _updateLeaseTerms();
        // check that client has enough tokens provisioned
        Allowance storage _allow = clients[msg.sender].allowance;
        if (_allow.balance == 0 || (limitPrice < minimumPricePerBit && _seats > 0)) {
            revert();
        }
        // If this is a lease cancellation, remove renter
        bool leased = false;
        updateCurrentAuction(limitPrice, _seats, msg.sender);
        if (_seats > 0) {
            clients[msg.sender].limitPrice = limitPrice;
            clients[msg.sender].seats = _seats;
            // add client to current term and deduct prorated price if seats available
            acceptClientBid(limitPrice, _seats);
            leased = true;
        }
        Leased(leased);
        return leased;
    }

    /// @notice Get the number of currently active renters
    function getNumberOfRenters() public view returns (uint) {
        _updateLeaseTerms();
        return currentRenters.length;
    }

    /// @notice Get the renter address at `(index)`
    /// @param index the index for which to return the renter address
    function getRenter(uint index) public view returns (address) {
        _updateLeaseTerms();
        return currentRenters[index];
    }

    /// @notice Get the current number of strategies
    function getNumberOfStrategies() public view returns (uint) {
        return permData.getNumberOfStrategies();
    }

    /// @notice Get the current number of seats awarded to the sender for the current lease term
    function getCurrentTermSeats() public view returns (uint) {
        _updateLeaseTerms();
        return auctionSeats[msg.sender];
    }

    /// @notice Get the expected number of seats awarded to the sender for next term based on current IU and bids
    function getNextTermSeats() public view returns (uint) {
        return _getNextTermSeats(msg.sender);
    }

    /// @notice get the current lease term number
    function getCurrentLeaseTerm() public view returns (uint) {
        _updateLeaseTerms();
        return leaseTerm;
    }

    /// @notice Get the strategy and incremental usefulness at the specified index
    /// @param index the index for which to return the strategy and incremental usefulness
    /// @return (string, string strategyHash, uint incremental_usefulness * 1e9)
    function getStrategy(uint index) public view returns (string, string, uint) {
        bytes20 blobh;
        bytes20 blobl;
        uint e;
        (blobh, blobl, e) = permData.getStrategy(index);
        string memory sh = bytes20ToString(blobh);
        string memory sl = bytes20ToString(blobl);
        return (sh, sl, e);
    }

    /// @notice Get number of currently available seats for the current lease term
    function getSeatsAvailable() public view returns (uint) {
        _updateLeaseTerms();
        return seatsAvailable;
    }

    /// @notice update the lease term and renters list
    /// @return true if the state has been updated
    function updateLeaseTerms() public whenNotPaused {
        _updateLeaseTerms();
    }

    /// @notice Used by owner to change the fee to gain access to historical data archive
    function setHistoricalDataFee(uint amount) public onlyOwner {
        historicalDataFee = amount;
        FeeChanged("Historical Data Fee", historicalDataFee);
    }

    /// @notice Used by owner to change the fee to gain power user privileges
    function setPowerUserClubFee(uint amount) public onlyOwner {
        powerUserClubFee = amount;
        FeeChanged("Power User Club Fee", powerUserClubFee);
    }

    /// @notice Used by owner to change the minimum to retain power user privileges
    function getPowerUserMinimum() public view returns (uint) {
        _updatePowerUserMin();
        return powerUserMinimum;
    }

    /// @notice Used by owner to set the usefulness baseline
    function setUsefulnessBaseline(uint8 dec) public onlyOwner require(dec <= 9) {
        usefulnessDecimals = dec;
        usefulnessBaseline = uint32(10 ** uint256(usefulnessDecimals));
        IncrementalUsefulnessPrecisionChanged(usefulnessBaseline);
    }

    /// @notice Used by owner to set minimum price per bit of incremental usefulness
    function setMinimumPricePerBit(uint amount) public onlyOwner {
        minimumPricePerBit = amount;
        FeeChanged("Minimum Price Per Bit", minimumPricePerBit);
    }

    /// @notice Used by owner to set total seats available
    function setTotalSeats(uint8 amount) public onlyOwner {
        totalSeats = amount;
        TotalSeatsChanged(totalSeats);
    }

    /// @notice Used by owner to set max percentage of seats occupied by a client
    function setMaxSeatPercentage(uint amount) public onlyOwner require(amount <= 100) {
        maxSeatPercentage = amount;
        maxSeatMultiple = 100 / maxSeatPercentage;
        MaxSeatsPerAddressChanged(maxSeatPercentage);
    }

    /*
     * Start of internal functions
     */
    function _getNextTermSeats(address _client) internal returns (uint seats) {
        _updateLeaseTerms();
        calculateLeasePriceForNextTerm(leaseTerm + 1);
        updatePriceForCurrentTerm();
        return auctionSeats[_client];
    }

    function _updatePriceNextTerm() internal returns (uint) {
        calculateLeasePriceForNextTerm(0);
        uint price = priceNextTerm.pricePerBitOfIU;
        uint totalPrice = price.mul(priceNextTerm.totalIncrementalUsefulness).div(usefulnessBaseline);
        return totalPrice;
    }

    function _updateLeaseTerms() internal {
        var (y, m,) = getCurrentDate();
        uint lt = calculateLeaseTerm(y, m);
        if (leaseTerm < lt) {
            if (leaseTerm > 0) {
                for (uint i = leaseTerm + 1; i <= lt; i++) {
                    calculateLeasePriceForNextTerm(i);
                    // Update price and add/remove renters based on new price
                    updatePriceForCurrentTerm();
                    // Update price history
                    priceHistory[i] = priceCurrentTerm;
                    uint price = priceCurrentTerm.pricePerBitOfIU.mul(priceCurrentTerm.totalIncrementalUsefulness).div(usefulnessBaseline);
                    // Deduct current term from client balances
                    for (uint clientIdx = 0; clientIdx < currentRenters.length; clientIdx++) {
                        if (clients[currentRenters[clientIdx]].allowance.leaseTermPaid < i) {
                            deductFullTerm(currentRenters[clientIdx], price, auctionSeats[currentRenters[clientIdx]]);
                            clients[currentRenters[clientIdx]].allowance.leaseTermPaid = i;
                        }
                    }
                }
            }
            priceNextTerm = priceCurrentTerm;
            leaseTerm = lt;
        }
        LeaseTermUpdated(leaseTerm);
        _updatePowerUserMin();
    }

    function _updatePowerUserMin() internal {
        uint indicativeRent = _updatePriceNextTerm();
        powerUserMinimum = indicativeRent > INIT_POWER_USER_MIN ? indicativeRent : INIT_POWER_USER_MIN;
        FeeChanged("Power User Minimum", powerUserMinimum);
    }

    function recognizeRevenue(uint256 amount) internal require(revenueWallet != 0x0) {
        token.transferFrom(escrowWallet, revenueWallet, amount);
    }

    /// @notice Finalizes the auction price for the next term
    function calculateLeasePriceForNextTerm(uint lt) internal {
        uint price = setAuctionPrice();
        AuctionPriceSet(lt, price);
        priceNextTerm.pricePerBitOfIU = price > minimumPricePerBit ? price : minimumPricePerBit;
        priceNextTerm.priceForAllStrategies = priceNextTerm.pricePerBitOfIU.mul(priceNextTerm.totalIncrementalUsefulness)
        .div(usefulnessBaseline);
        LeasePriceCalculated(priceNextTerm.pricePerBitOfIU, priceNextTerm.priceForAllStrategies);
    }

    function setAuctionPrice() internal returns (uint) {
        bytes32 maxId = permData.getIndexMax();
        if (maxId == 0x0) {
            return minimumPricePerBit;
        }
        uint rev = 0;
        uint seatsRented = 0;
        bytes32 curNode = maxId;
        bytes32 pNode;
        address client;
        uint8 seats;
        uint pricePerBit;
        uint winningPricePerBit = minimumPricePerBit;

        while (curNode != 0x0) {
            (client, seats, pricePerBit) = permData.getNodeValueBid(curNode);
            uint dues = pricePerBit.mul(totalIncrementalUsefulness).div(usefulnessBaseline) * seats;
            // can this client pay dues for this term at current price?
            if (seats == 0 || dues > clients[client].allowance.balance) {
                // next node, ignore current node
                pNode = permData.getPreviousNode(curNode);
                curNode = pNode != 0x0 ? pNode : bytes32(0x0);
                continue;
            }

            seatsRented = seatsRented + seats;
            uint tempRev = seatsRented * pricePerBit;
            // if revenue drops, we found optimal auction price
            if (seatsRented > totalSeats || tempRev < rev) {
                return winningPricePerBit;
            }

            // record current best and continue
            winningPricePerBit = pricePerBit;
            rev = tempRev;
            pNode = permData.getPreviousNode(curNode);
            curNode = pNode != 0x0 ? pNode : bytes32(0x0);
        }
        return winningPricePerBit;
    }

    /// @notice Adds a bid to the current auction
    /// @param _bid The limit price bid for this client
    /// @param _seats The number of seats wanted by this client
    /// @param _client The client's address
    function updateCurrentAuction(uint _bid, uint8 _seats, address _client) internal {
        uint8 seats = _seats;
        bytes32 id = keccak256(_client);
        if (seats > 0) {
            seats = totalSeats / _seats >= maxSeatMultiple ? _seats : uint8(totalSeats / maxSeatMultiple);
            permData.insert(id, _client, seats, _bid);
        }
        else {
            permData.remove(id);
            clients[msg.sender].limitPrice = 0x0;
            clients[msg.sender].seats = 0x0;
            BidCanceled(_client);
        }
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

    function deductCurrentTermRent(address _client, uint price, uint seats) internal {
        uint decimals = 8;
        uint _extraSeats = seats - auctionSeats[msg.sender];
        // if the user is not requesing more seats
        if (_extraSeats <= 0)
            return;
        // calculate prorated current term dues and deduct from allowance
        var (y, m, d) = getCurrentDate();
        uint mDays = dateUtils.getDaysInMonth(uint8(m), uint16(y));
        uint256 fullRent = price.mul(_extraSeats).mul(10 ** decimals);
        uint daysDue = mDays - (d - 1);
        uint proratedRent = fullRent.mul(daysDue).div(mDays).div(10 ** decimals);
        Allowance storage _allow = clients[_client].allowance;
        if (_allow.balance >= proratedRent) {
            _allow.balance = _allow.balance.sub(proratedRent);
            recognizeRevenue(proratedRent);
            _allow.leaseTermPaid = leaseTerm;
            BalanceChanged("decreased", proratedRent);
            updatePowerUserStatus(_client);
        } else
            revert();
    }

    function deductFullTerm(address _client, uint price, uint seats) internal {
        uint fullRent = price * seats;
        Allowance storage _allow = clients[_client].allowance;
        if (_allow.balance >= fullRent) {
            _allow.balance = _allow.balance.sub(fullRent);
            recognizeRevenue(fullRent);
            updatePowerUserStatus(_client);
        } else {
            recognizeRevenue(_allow.balance);
            _allow.balance = 0;
        }
    }

    function acceptClientBid(uint _bid, uint8 _seats) internal {
        // This client can also be an existing client
        uint price = max(priceCurrentTerm.pricePerBitOfIU, minimumPricePerBit);
        uint8 _extraSeats = _seats - (auctionSeats[msg.sender] != 0x0 ? auctionSeats[msg.sender] : 0);
        uint8 seats = _extraSeats <= seatsAvailable ? _extraSeats : seatsAvailable;
        if (seats > 0)
            seats = totalSeats / seats >= maxSeatMultiple ? seats : uint8(totalSeats / maxSeatMultiple);
        if (_bid >= price) {
            if (seats > 0) {
                uint totalIU = priceCurrentTerm.totalIncrementalUsefulness > 0 ? priceCurrentTerm.totalIncrementalUsefulness : totalIncrementalUsefulness;
                uint totalPrice = price.mul(totalIU).div(usefulnessBaseline);
                deductCurrentTermRent(msg.sender, totalPrice, seats);
                seatsAvailable -= seats;
                auctionSeats[msg.sender] += _extraSeats;
                if (!clientsAsRenters[msg.sender]) {
                    currentRenters.push(msg.sender);
                    RenterAdded(msg.sender);
                    clientsAsRenters[msg.sender] = true;
                }
            }
        }
    }

    // Devise rental is scheduled to go live in 2018, April, which
    // is considered the first lease term
    function calculateLeaseTerm(uint _year, uint _month) internal pure returns (uint) {
        return (_year - GENESIS_YEAR) * 12 + _month - GENESIS_MONTH;
    }

    function calculateRenterDues(Price _price, address _client) internal returns (uint) {
        uint totalPrice = _price.pricePerBitOfIU.mul(_price.totalIncrementalUsefulness).div(usefulnessBaseline);
        return totalPrice * auctionSeats[_client];
    }

    function removeCurrentRenterByIndex(uint index) internal {
        if (currentRenters.length > 1) {
            currentRenters[index] = currentRenters[currentRenters.length - 1];
            // recover gas
            delete (currentRenters[currentRenters.length - 1]);
        }
        currentRenters.length--;
    }

    function removeCurrentRenterByValue(address _client) internal {
        for (uint i = 0; i < currentRenters.length; i++) {
            if (currentRenters[i] == _client) {
                removeCurrentRenterByIndex(i);
                break;
            }
        }
    }

    function updateRentersList() internal {
        // Remove renters who's limit price falls below current price or don't have enough allowance
        for (uint i = 0; i < currentRenters.length; i++) {
            uint8 extraSeats = clients[currentRenters[i]].seats - auctionSeats[currentRenters[i]];
            // Client wants more or less seats
            if (auctionSeats[currentRenters[i]] != clients[currentRenters[i]].seats && seatsAvailable > extraSeats) {
                seatsAvailable -= extraSeats;
                auctionSeats[currentRenters[i]] = clients[currentRenters[i]].seats;
            }
            uint bid = clients[currentRenters[i]].limitPrice;
            uint currentBalance = clients[currentRenters[i]].allowance.balance;
            if (bid < priceCurrentTerm.pricePerBitOfIU || clients[currentRenters[i]].seats == 0 ||
            calculateRenterDues(priceCurrentTerm, currentRenters[i]) > currentBalance) {
                // Removed renters give back their seatsAvailable
                seatsAvailable += auctionSeats[currentRenters[i]];
                auctionSeats[currentRenters[i]] = 0;
                clientsAsRenters[currentRenters[i]] = false;
                RenterRemoved(currentRenters[i]);
                removeCurrentRenterByIndex(i);
            }
        }
        addEligibleRenters(priceCurrentTerm);
    }

    function addEligibleRenters(Price _price) internal {
        bytes32 curNode = permData.getIndexMax();
        uint bid;
        uint8 seats;
        address client;
        bytes32 pNode;

        while (curNode != 0x0) {
            (client, seats, bid) = permData.getNodeValueBid(curNode);
            if (bid >= _price.pricePerBitOfIU && !clientsAsRenters[client]) {
                uint dues = _price.pricePerBitOfIU.mul(_price.totalIncrementalUsefulness).div(usefulnessBaseline) * seats;
                if (dues > clients[client].allowance.balance) {
                    pNode = permData.getPreviousNode(curNode);
                    curNode = pNode != 0x0 ? pNode : bytes32(0x0);
                    continue;
                }
                currentRenters.push(client);
                RenterAdded(client);
                clientsAsRenters[client] = true;
            }
            if (bid < _price.pricePerBitOfIU)
                break;
            pNode = permData.getPreviousNode(curNode);
            curNode = pNode != 0x0 ? pNode : bytes32(0x0);
        }
    }

    function updatePriceForCurrentTerm() internal {
        priceCurrentTerm.pricePerBitOfIU = priceNextTerm.pricePerBitOfIU;
        priceCurrentTerm.priceForAllStrategies = priceNextTerm.priceForAllStrategies;
        priceCurrentTerm.totalIncrementalUsefulness = priceNextTerm.totalIncrementalUsefulness;
        updateRentersList();
    }

    function updatePowerUserStatus(address _client) internal {
        Allowance storage _allow = clients[_client].allowance;
        if (_allow.isPowerUser && _allow.balance < powerUserMinimum) {
            _allow.isPowerUser = false;
            _allow.canAccessHistoricalData = false;
        }
    }

    function bytes20ToString(bytes32 x) private pure returns (string) {
        bytes memory bytesString = new bytes(20);
        uint charCount = 0;
        for (uint j = 0; j < 20; j++) {
            byte char = byte(bytes32(uint(x) * 2 ** (8 * j)));
            if (char != 0) {
                bytesString[charCount] = char;
                charCount++;
            }
        }
        bytes memory bytesStringTrimmed = new bytes(charCount);
        for (j = 0; j < charCount; j++) {
            bytesStringTrimmed[j] = bytesString[j];
        }
        return string(bytesStringTrimmed);
    }

    function max(uint a, uint b) private pure returns (uint) {
        return a > b ? a : b;
    }
}