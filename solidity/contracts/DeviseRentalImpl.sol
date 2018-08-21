pragma solidity ^0.4.23;

import "./DeviseRentalStorage.sol";


/// @title A lease contract for synthetic market representations
/// @author Pit.AI
contract DeviseRentalImpl is DeviseRentalStorage, RBAC {
    using SafeMath for uint256;

    string public constant ROLE_MASTER_NODE = "master-node";
    address[] public masterNodes;
    mapping(bytes20 => uint256) public leptons;

    //    modifier require(bool _condition) {
    //        if (!_condition) revert();
    //        _;
    //    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    modifier onlyMasterNodes() {
        checkRole(msg.sender, ROLE_MASTER_NODE);
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
    event LeptonAdded(bytes20 s, uint iu);
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
    function setEscrowWallet(address addr) public onlyOwner {
        require(owner != addr && revenueWallet != addr);
        require(escrowWallet != addr);
        escrowWallet = addr;
        escrowHistory.push(addr);
        WalletChanged("The escrow wallet has been changed to ", escrowWallet);
    }

    /// @notice get escrow wallet history
    /// @return an array of addresses
    function getEscrowHistory() public view returns (address[]) {
        return escrowHistory;
    }

    /// @notice set revenue wallet
    /// @param addr The address of the revenue wallet
    function setRevenueWallet(address addr) public onlyOwner {
        require(owner != addr && escrowWallet != addr);
        require(revenueWallet != addr);
        revenueWallet = addr;
        revenueHistory.push(addr);
        WalletChanged("The revenue wallet has been changed to ", revenueWallet);
    }

    /// @notice get revenue wallet history
    /// @return an array of addresses
    function getRevenueHistory() public view returns (address[]) {
        return revenueHistory;
    }

    /// @dev Return two index-aligned arrays with implementation addresses and version numbers
    /// @return an array of implementation addresses and array of version numbers
    function getAllImplementations() public view returns (address[], uint[]) {
        uint len = implHistory.length;
        address[] memory impl = new address[](len);
        uint[] memory ver = new uint[](len);
        for (uint i = 0; i < len; i++) {
            impl[i] = implHistory[i];
            ver[i] = implVersions[impl[i]];
        }
        return (impl, ver);
    }

    /// @dev Gets the address of the current implementation
    /// @return address of the current implementation
    function implementation() public view returns (address) {
        return _implementation;
    }

    /// @dev Gets the version of the current implementation
    /// @return address of the current implementation
    function version() public view returns (uint) {
        return implVersions[_implementation];
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
    function provision(uint _amount) public whenNotPaused {
        require(_amount > 0);
        require(escrowWallet != 0x0);
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        token.transferFrom(msg.sender, escrowWallet, _amount);
        clients[msg.sender].allowance.balance = clients[msg.sender].allowance.balance.add(_amount);
        if (!clients[msg.sender].isClient) {
            clientsArray.push(msg.sender);
            clients[msg.sender].isClient = true;
        }
        updatePowerUserStatus(msg.sender);
    }

    /// @notice Withdraw tokens back from the lease allowance to the Token contract
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint amount) public whenNotPaused {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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
    function getClientSummary(address _client) public view
    returns (address, uint, uint, uint, bool, bool, uint, uint) {
        require(clients[_client].isClient);
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return clients[msg.sender].allowance.balance;
    }

    /// @notice Get the total incremental usefulness of the blockchain
    /// @return the total incremental usefulness of the blockchain
    function getTotalIncrementalUsefulness() public view returns (uint) {
        return totalIncrementalUsefulness;
    }

    function getPricePerBitCurrentTerm() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        uint price = priceCurrentTerm.pricePerBitOfIU;
        return price;
    }

    /// @notice Get the prevailing price for the current lease term
    function getRentPerSeatCurrentTerm() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        uint price = priceCurrentTerm.pricePerBitOfIU;
        uint totalIU = priceCurrentTerm.totalIncrementalUsefulness > 0 ? priceCurrentTerm.totalIncrementalUsefulness : totalIncrementalUsefulness;
        uint totalPrice = price.mul(totalIU).div(usefulnessBaseline);
        return totalPrice;
    }

    function getIndicativePricePerBitNextTerm() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        calculateLeasePriceForNextTerm(0);
        uint price = priceNextTerm.pricePerBitOfIU;
        return price;
    }

    /// @notice Get the current prevailing price for the next lease term
    function getIndicativeRentPerSeatNextTerm() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return _updatePriceNextTerm();
    }

    /// @notice Add a lepton to the chain, to be called by the contract owners as leptons are mined and selected
    /// @param _lepton A sha1 lepton hash
    /// @param _prevLepton The previous sha1 lepton hash in the chain
    /// @param _incrementalUsefulness The incremental usefulness added by the lepton being added
    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public onlyMasterNodes {
        require(_incrementalUsefulness > 0);
        uint numLeptons = permData.getNumberOfLeptons();
        if (numLeptons > 0) {
            var (prevHash,) = permData.getLepton(numLeptons - 1);
            if (prevHash != _prevLepton)
                revert("Previous lepton does not match the last lepton in the chain!");
        }
        if (leptons[_lepton] != 0)
            revert("Duplicate lepton!");

        _addLepton(_lepton, _incrementalUsefulness);
        leptons[_lepton] = permData.getNumberOfLeptons();
    }

    /**
     * @dev adds the master node role to an address
     * @param addr address
     */
    function addMasterNode(address addr) public onlyOwner {
        if (!hasRole(addr, ROLE_MASTER_NODE)) {
            addRole(addr, ROLE_MASTER_NODE);
            masterNodes.push(addr);
        }
    }

    /**
     * @dev removes the master node role from address
     * @param addr address
     */
    function removeMasterNode(address addr) public onlyOwner {
        if (hasRole(addr, ROLE_MASTER_NODE)) {
            removeRole(addr, ROLE_MASTER_NODE);
            removeMasterNodeByValue(addr);
        }
    }

    /**
     * @dev returns all current master nodes
     */
    function getMasterNodes() public constant returns (address[]) {
        return masterNodes;
    }

    /// @notice apply for access to power user only data
    function applyForPowerUser() public whenNotPaused returns (bool status) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        Allowance storage _allow = clients[msg.sender].allowance;
        return _allow.isPowerUser;
    }

    /// @notice Gain access to historical data download for all the leptons
    function requestHistoricalData() public whenNotPaused {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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

    /// Get all bids from the bid grove
    /// @return address[] bidders, uint8[] seats, uint[] bids
    function getAllBidders() public view returns (address[] memory bidders, uint8[] memory seats, uint[] memory limitPrices) {
        // Get number of bids in the grove so we can build our fixed sized memory arrays
        uint numberOfBids = 0;
        bytes32 curNode = permData.getIndexMax();
        bytes32 pNode;
        while (curNode != 0x0) {
            var (_client, _bidSeats,) = permData.getNodeValueBid(curNode);
            if (_bidSeats > 0)
                numberOfBids++;
            pNode = permData.getPreviousNode(curNode);
            curNode = pNode != 0x0 ? pNode : bytes32(0x0);
        }

        // create fixed sized memory arrays
        bidders = new address[](numberOfBids);
        seats = new uint8[](numberOfBids);
        limitPrices = new uint[](numberOfBids);
        // populate arrays from grove
        curNode = permData.getIndexMax();
        uint idx = 0;
        while (curNode != 0x0) {
            var (client, bidSeats, pricePerBit) = permData.getNodeValueBid(curNode);
            if (bidSeats > 0) {
                bidders[idx] = client;
                seats[idx] = bidSeats;
                limitPrices[idx] = pricePerBit;
                idx++;
            }
            pNode = permData.getPreviousNode(curNode);
            curNode = pNode != 0x0 ? pNode : bytes32(0x0);
        }

        return (bidders, seats, limitPrices);
    }

    /// @notice Bid for a number of seats up to a limit price per bit of information
    function leaseAll(uint limitPrice, uint8 _seats) public whenNotPaused returns (bool) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return currentRenters.length;
    }

    /// @notice Get the renter address at `(index)`
    /// @param index the index for which to return the renter address
    function getRenter(uint index) public view returns (address) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return currentRenters[index];
    }

    /// Get all renter addresses
    /// @return address[]
    function getAllRenters() public view returns (address[]) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return currentRenters;
    }

    /// @notice Get the number of clients
    function getNumberOfClients() public view returns (uint) {
        return clientsArray.length;
    }

    /// @notice Get the client address at `(index)`
    /// @param index the index for which to return the client's address
    function getClient(uint index) public view returns (address) {
        return clientsArray[index];
    }

    /// Get all client addresses
    /// @return address[]
    function getAllClients() public view returns (address[]) {
        return clientsArray;
    }

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        return permData.getNumberOfLeptons();
    }

    /// @notice Get the current number of seats awarded to the sender for the current lease term
    function getCurrentTermSeats() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return auctionSeats[msg.sender];
    }

    /// @notice Get the expected number of seats awarded to the sender for next term based on current IU and bids
    function getNextTermSeats() public view returns (uint) {
        return _getNextTermSeats(msg.sender);
    }

    /// @notice get the current lease term number
    function getCurrentLeaseTerm() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return leaseTerm;
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (string, string leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public view returns (bytes20, uint) {
        return permData.getLepton(index);
    }

    /// Get all leptons
    /// @return bytes20[], uint[]
    function getAllLeptons() public view returns (bytes20[], uint[]) {
        uint numLeptons = permData.getNumberOfLeptons();
        bytes20[] memory hashes = new bytes20[](numLeptons);
        uint[] memory ius = new uint[](numLeptons);
        for (uint x = 0; x < numLeptons; x++) {
            var (hash, iu) = permData.getLepton(x);
            hashes[x] = hash;
            ius[x] = iu;
        }
        return (hashes, ius);
    }

    /// @notice Get number of currently available seats for the current lease term
    function getSeatsAvailable() public view returns (uint) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
        _updateLeaseTerms();
        return seatsAvailable;
    }

    /// @notice update the lease term and renters list
    /// @return true if the state has been updated
    function updateLeaseTerms() public whenNotPaused {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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
        _updateLeaseTerms();
        _updatePowerUserMin();
        return powerUserMinimum;
    }

    /// @notice Used by owner to set the usefulness baseline
    function setUsefulnessBaseline(uint8 dec) public onlyOwner {
        require(dec <= 9);
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
    function setMaxSeatPercentage(uint amount) public onlyOwner {
        require(amount <= 100);
        maxSeatPercentage = amount;
        maxSeatMultiple = 100 / maxSeatPercentage;
        MaxSeatsPerAddressChanged(maxSeatPercentage);
    }

    /*
     * Start of internal functions
     */
    /// @dev Add a lepton to the chain, to be called by the contract owners as leptons are mined and selected
    /// @param _lepton A sha1 lepton hash
    /// @param _incrementalUsefulness The incremental usefulness added by the lepton being added
    function _addLepton(bytes20 _lepton, uint _incrementalUsefulness) internal {
        var (y, m,) = getCurrentDate();
        uint IUTerm = calculateLeaseTerm(y, m) + 1;
        if (IUTerm > leaseTerm + 1) {
            // bring contract state up to date with the current lease term to calculate current prices and escrow balances
            _updateLeaseTerms();
        }
        permData.addLepton(_lepton, _incrementalUsefulness);
        priceNextTerm.totalIncrementalUsefulness = totalIncrementalUsefulness = totalIncrementalUsefulness.add(_incrementalUsefulness);
        LeptonAdded(_lepton, _incrementalUsefulness);
    }

    /**
     * @dev removes a master node from the master nodes array
     */
    function removeMasterNodeByValue(address addr) internal {
        for (uint i; i < masterNodes.length; i++) {
            if (masterNodes[i] == addr) {
                if (masterNodes.length > 1) {
                    // copy last element into this address spot and shrink array
                    masterNodes[i] = masterNodes[masterNodes.length - 1];
                    masterNodes.length--;
                } else
                    masterNodes.length = 0;

                return;
            }
        }
    }

    function _getNextTermSeats(address _client) internal returns (uint seats) {
        // bring contract state up to date with the current lease term to calculate current prices and escrow balances
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

    /// @dev This is the main contract state updater. It catches up the lease terms by running the auction price logic
    /// for each past and current lease term since the last closed auction. For each lease term, renter balances are
    /// updated to reflect the rent paid for that term so that following auctions are based on accurate escrow balances.
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

    function recognizeRevenue(uint256 amount) internal {
        require(revenueWallet != 0x0);
        token.transferFrom(escrowWallet, revenueWallet, amount);
    }

    /// @notice Finalizes the auction price for the next term
    function calculateLeasePriceForNextTerm(uint lt) internal {
        uint price = setAuctionPrice();
        AuctionPriceSet(lt, price);
        priceNextTerm.pricePerBitOfIU = price > minimumPricePerBit ? price : minimumPricePerBit;
        priceNextTerm.priceForAllLeptons = priceNextTerm.pricePerBitOfIU.mul(priceNextTerm.totalIncrementalUsefulness)
        .div(usefulnessBaseline);
        LeasePriceCalculated(priceNextTerm.pricePerBitOfIU, priceNextTerm.priceForAllLeptons);
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

    function deductCurrentTermRent(address _client, uint price, uint _extraSeats) internal {
        uint decimals = 8;
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
        // seats are less or the same than current seats, no need to do anything here
        if (_seats <= auctionSeats[msg.sender])
            return;
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
            // if client requests less seats going forward
            if (clients[currentRenters[i]].seats < auctionSeats[currentRenters[i]]) {
                seatsAvailable += auctionSeats[currentRenters[i]] - clients[currentRenters[i]].seats;
                auctionSeats[currentRenters[i]] = clients[currentRenters[i]].seats;
            } else {
                // if client requests more seats going forward
                uint8 extraSeats = clients[currentRenters[i]].seats - auctionSeats[currentRenters[i]];
                // Client wants more or less seats
                if (auctionSeats[currentRenters[i]] != clients[currentRenters[i]].seats && seatsAvailable > extraSeats) {
                    seatsAvailable -= extraSeats;
                    auctionSeats[currentRenters[i]] = clients[currentRenters[i]].seats;
                }
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
                i = i - 1;
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

        while (curNode != 0x0 && seatsAvailable > 0) {
            (client, seats, bid) = permData.getNodeValueBid(curNode);
            if (bid >= _price.pricePerBitOfIU && !clientsAsRenters[client]) {
                uint dues = _price.pricePerBitOfIU.mul(_price.totalIncrementalUsefulness).div(usefulnessBaseline) * seats;
                if (dues > clients[client].allowance.balance) {
                    pNode = permData.getPreviousNode(curNode);
                    curNode = pNode != 0x0 ? pNode : bytes32(0x0);
                    continue;
                }
                currentRenters.push(client);
                auctionSeats[client] = seatsAvailable < seats ? seatsAvailable : seats;
                seatsAvailable = seatsAvailable - auctionSeats[client];
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
        priceCurrentTerm.priceForAllLeptons = priceNextTerm.priceForAllLeptons;
        priceCurrentTerm.totalIncrementalUsefulness = priceNextTerm.totalIncrementalUsefulness;
        updateRentersList();
    }

    function updatePowerUserStatus(address _client) internal {
        Allowance storage _allow = clients[_client].allowance;
        // if there is no fee, no need to apply
        if (_allow.balance >= powerUserMinimum) {
            if (powerUserClubFee == 0) {
                _allow.isPowerUser = true;
                if (historicalDataFee == 0)
                    _allow.canAccessHistoricalData = true;
            }
        } else if (_allow.isPowerUser || _allow.canAccessHistoricalData) {
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