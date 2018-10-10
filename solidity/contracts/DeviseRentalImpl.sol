pragma solidity ^0.4.23;

import "./DeviseRentalStorage.sol";
import "./AccountingImpl.sol";
import "./AuctionImpl.sol";
import "./DeviseRentalStorage.sol";
import "./AccessControlImpl.sol";
import "./DeviseMiningImpl.sol";


/// @title A lease contract for synthetic market representations
/// @author Pit.AI
contract DeviseRentalImpl is DeviseRentalStorage, RBAC {
    using SafeMath for uint256;

    string public constant ROLE_RATE_SETTER = "rate-setter";
    address public rateSetter;

    // Use 8 decimal points for the rate based on the Coinbase number
    uint public rateETHUSD;
    address public tokenSaleWallet;
    uint public constant RATE_USD_DVZ = 10;
    uint8 internal constant USD_DECIMALS = 8;
    Accounting public accounting;
    AccessControl public accessControl;
    DeviseMiningImpl public leptonProxy;

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    modifier onlyRateSetters() {
        checkRole(msg.sender, ROLE_RATE_SETTER);
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
    event CurrentAllowance(uint amount);
    event BalanceChanged(address clientAddress, string direction, uint amount);
    event WalletChanged(string msg, address addr);
    event DataContractChanged(address addr);
    event BeneficiaryChanged(address addr, address ben);
    event LeptonAdded(bytes20 s, uint iu);
    event LeaseTermUpdated(uint lt);
    event FeeChanged(string src, uint amt);
    event IncrementalUsefulnessPrecisionChanged(uint32 prec);
    event TotalSeatsChanged(uint8 s);
    event MaxSeatsPerAddressChanged(uint ts);
    event LeasePriceCalculated(uint leaseTerm, uint256 prc, uint all);
    event AuctionPriceSet(uint256 leaseTerm, uint256 prc);
    event RenterAdded(address client);
    event RenterRemoved(address client);
    event BidCanceled(address client);
    event RateUpdated(uint timestamp, uint rate);
    event FileCreated(bytes20 contentHash);
    event AccountingContractChanged(address newAddress);
    event AuctionContractChanged(address newAddress);
    event LeaseContractChanged(address newAddress);

    /// @notice set ETH/USD rate
    /// @param rate The rate for ETH/USD that should be used
    function setRateETHUSD(uint rate) public onlyRateSetters {
        require(rate > 0);
        rateETHUSD = rate;
        RateUpdated(block.timestamp, rate);
    }

    function setTokenWallet(address _tokenSaleWallet) public onlyOwner {
        tokenSaleWallet = _tokenSaleWallet;
    }

    /// @notice set escrow wallet
    /// @param addr The address of the escrow wallet
    function setEscrowWallet(address addr) public onlyOwner {
        require(owner != addr && revenueWallet != addr);
        require(escrowWallet != addr);
        escrowWallet = addr;
        escrowHistory.push(addr);
        accounting.setEscrowWallet(addr);
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
        accounting.setRevenueWallet(addr);
        WalletChanged("The revenue wallet has been changed to ", revenueWallet);
    }

    function setAccountingContract(Accounting accounting_) public onlyOwner {
        accounting = accounting_;
        AccountingContractChanged(accounting);
    }

    function setAccessControlContract(AccessControl accessControl_) public onlyOwner {
        accessControl = accessControl_;
        LeaseContractChanged(accessControl_);
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

    function setLeptonProxy(DeviseMiningImpl _proxy) public onlyOwner {
        leptonProxy = _proxy;
    }

    /// @notice transfers `(amount)` from the sender's token wallet to the internal ledger for use to pay for lease
    /// @param client The client address to increase the balance in escrow for
    /// @param amount The number of tokens to allow for payment of lease dues
    function provisionOnBehalfOf(address client, uint amount) public whenNotPaused {
        accessControl.updateGlobalState();
        accounting.provisionOnBehalfOf(msg.sender, client, amount);
    }

    /// @notice provisions DVZ to the internal ledger for use to pay for lease corresponding to the ETH paid
    function provisionWithEther() public whenNotPaused payable {
        require(rateETHUSD > 0);
        require(escrowWallet != 0x0);
        require(tokenSaleWallet != 0x0);
        require(msg.value > 0);
        uint256 _weiAmount = msg.value;
        // Convert ETH to USD, keeping all the decimal points
        // 18 on the ETH side and 8 on the USD side
        uint usd = _weiAmount.mul(rateETHUSD);
        // USD/DVZ rate is 10 and a numeral literal is used here
        uint dvz = usd.mul(RATE_USD_DVZ);
        uint8 decimals = 18 + USD_DECIMALS - token.decimals();
        dvz = dvz.div(10 ** uint256(decimals));
        accessControl.updateGlobalState();
        accounting.provisionOnBehalfOf(tokenSaleWallet, msg.sender, dvz);
        tokenSaleWallet.transfer(msg.value);
    }

    /// @notice transfers `(_amount)` from the token contract to the internal ledger for use to pay for lease
    /// @param _amount The number of tokens to allow for payment of lease dues
    function provision(uint _amount) public whenNotPaused {
        accessControl.updateGlobalState();
        accounting.provisionOnBehalfOf(msg.sender, msg.sender, _amount);
    }

    /// @notice Withdraw tokens back from the lease allowance to the Token contract
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint amount) public whenNotPaused {
        accessControl.updateGlobalState();
        accounting.withdraw(msg.sender, amount);
    }

    /// @notice Designate an address to be authorized to consume the leased data on behalf of sender
    /// @param _beneficiary A beneficiary address
    function designateBeneficiary(address _beneficiary) public whenNotPaused {
        accounting.designateBeneficiary(msg.sender, _beneficiary);
    }

    /// @notice Get the beneficiary address designated by the current sender to receive the leased data
    function getBeneficiary() public view returns (address) {
        return accounting.getBeneficiary(msg.sender);
    }

    /// @notice Get the money account address for which the current sender is a beneficiary
    function getClientForBeneficiary() public view returns (address) {
        return accounting.getClientForBeneficiary(msg.sender);
    }

    /// @notice Get the beneficiary address designated by the `(_client)` to receive the leased data
    /// @param _client the address of the client for which to return the beneficiary
    function getClientSummary(address _client) public view
    returns (address beneficiary, uint escrowAllowance, uint tokenBalance, uint leaseTermPaid, bool isPowerUser,
        bool canAccessHistoricalData, uint seats, uint indicativeNextTermSeats) {
        accessControl.updateGlobalState();
        (beneficiary, escrowAllowance, tokenBalance, leaseTermPaid, isPowerUser, canAccessHistoricalData) =
        accounting.getClientSummary(_client);
        seats = accessControl.getCurrentTermSeats(_client);
        indicativeNextTermSeats = accessControl.getNextTermSeats(_client);
        return (beneficiary, escrowAllowance, tokenBalance, leaseTermPaid, isPowerUser, canAccessHistoricalData, seats,
        indicativeNextTermSeats);
    }

    /// @notice Updates and returns the current lease allowance in tokens of the `message.caller.address()`
    /// @return The allowance of the message sender
    function getAllowance() public view returns (uint amount) {
        accessControl.updateGlobalState();
        return accounting.getAllowance(msg.sender);
    }

    /// @notice Get the total incremental usefulness of the blockchain
    /// @return the total incremental usefulness of the blockchain
    function getTotalIncrementalUsefulness() public view returns (uint) {
        return leptonProxy.getTotalIncrementalUsefulness();
    }

    function getPricePerBitCurrentTerm() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getPricePerBitCurrentTerm();
    }

    /// @notice Get the prevailing price for the current lease term
    function getRentPerSeatCurrentTerm() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getRentPerSeatCurrentTerm();
    }

    function getIndicativePricePerBitNextTerm() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getIndicativePricePerBitNextTerm();
    }

    /// @notice Get the current prevailing price for the next lease term
    function getIndicativeRentPerSeatNextTerm() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getIndicativeRentPerSeatNextTerm();
    }

    /// @notice Add a lepton to the chain, to be called by the contract owners as leptons are mined and selected
    /// @param _lepton A sha1 lepton hash
    /// @param _prevLepton The previous sha1 lepton hash in the chain
    /// @param _incrementalUsefulness The incremental usefulness added by the lepton being added
    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public {
        if (!leptonProxy.isMasterNode(msg.sender)) revert();
        accessControl.updateGlobalState();
        leptonProxy.addLepton(_lepton, _prevLepton, _incrementalUsefulness);
    }

    /**
     * @dev adds the master node role to an address
     * @param addr address
     */
    function addMasterNode(address addr) public onlyOwner {
        // can't do delegatecall as we need to use the storage of leptonProxy contract
        leptonProxy.addMasterNode(addr);
    }

    /**
     * @dev adds a rate setter role to an address
     * @param addr address
     */
    function addRateSetter(address addr) public onlyOwner {
        removeRateSetter(rateSetter);
        if (!hasRole(addr, ROLE_RATE_SETTER)) {
            addRole(addr, ROLE_RATE_SETTER);
            rateSetter = addr;
        }
    }

    /**
     * @dev removes the master node role from address
     * @param addr address
     */
    function removeMasterNode(address addr) public onlyOwner {
        leptonProxy.removeMasterNode(addr);
    }

    /**
     * @dev removes the rate setter role from address
     * @param addr address
     */
    function removeRateSetter(address addr) public onlyOwner {
        if (hasRole(addr, ROLE_RATE_SETTER)) {
            removeRole(addr, ROLE_RATE_SETTER);
            rateSetter = 0x0;
        }
    }

    /**
     * @dev returns all current master nodes
     */
    function getMasterNodes() public constant returns (address[]) {
        return leptonProxy.getMasterNodes();
    }

    /// @notice apply for access to power user only data
    function applyForPowerUser() public whenNotPaused returns (bool status) {
        accessControl.updateGlobalState();
        return accounting.applyForPowerUser(msg.sender);
    }

    /// @notice Check if `message.caller.address()` is a power user
    /// @return true if user is a power user, false otherwise
    function isPowerUser() public view returns (bool status) {
        accessControl.updateGlobalState();
        return accounting.isPowerUser(msg.sender);
    }

    /// @notice Gain access to historical data download for all the leptons
    function requestHistoricalData() public whenNotPaused {
        accessControl.updateGlobalState();
        return accounting.requestHistoricalData(msg.sender);
    }

    /// Get all bids from the bid grove
    /// @return address[] bidders, uint8[] seats, uint[] bids
    function getAllBidders() public view returns (address[] memory bidders, uint8[] memory seats, uint[] memory limitPrices) {
        return accessControl.getAllBidders();
    }

    /// @notice Bid for a number of seats up to a limit price per bit of information
    function leaseAll(uint limitPrice, uint8 _seats) public whenNotPaused {
        accessControl.updateGlobalState();
        accessControl.leaseAll(msg.sender, limitPrice, _seats);
    }

    /// @notice Get the number of currently active renters
    function getNumberOfRenters() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getNumberOfRenters();
    }

    /// @notice Get the renter address at `(index)`
    /// @param index the index for which to return the renter address
    function getRenter(uint index) public view returns (address) {
        accessControl.updateGlobalState();
        return accessControl.getRenter(index);
    }

    /// Get all renter addresses
    /// @return address[]
    function getAllRenters() public view returns (address[]) {
        accessControl.updateGlobalState();
        return accessControl.getAllRenters();
    }

    /// @notice Get the number of clients
    function getNumberOfClients() public view returns (uint) {
        return accounting.getNumberOfClients();
    }

    /// @notice Get the client address at `(index)`
    /// @param index the index for which to return the client's address
    function getClient(uint index) public view returns (address) {
        return accounting.getClient(index);
    }

    /// Get all client addresses
    /// @return address[]
    function getAllClients() public view returns (address[]) {
        return accounting.getAllClients();
    }

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        return leptonProxy.getNumberOfLeptons();
    }

    /// @notice Get the current number of seats awarded to the sender for the current lease term
    function getCurrentTermSeats() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getCurrentTermSeats(msg.sender);
    }

    /// @notice Get the expected number of seats awarded to the sender for next term based on current IU and bids
    function getNextTermSeats() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getNextTermSeats(msg.sender);
    }

    /// @notice get the current lease term number
    function getCurrentLeaseTerm() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getCurrentLeaseTerm();
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (string, string leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public view returns (bytes20, uint) {
        return leptonProxy.getLepton(index);
    }

    /// Get all leptons
    /// @return bytes20[], uint[]
    function getAllLeptons() public view returns (bytes20[], uint[]) {
        return leptonProxy.getAllLeptons();
    }

    /// @notice Get number of currently available seats for the current lease term
    function getSeatsAvailable() public view returns (uint) {
        accessControl.updateGlobalState();
        return accessControl.getSeatsAvailable();
    }

    function seatsAvailable() public view returns (uint) {
        return accessControl.getSeatsAvailable();
    }

    function leaseTerm() public view returns (uint) {
        return accessControl.getCurrentLeaseTerm();
    }

    function totalSeats() public view returns (uint) {
        return accessControl.totalSeats();
    }

    function minimumPricePerBit() public view returns (uint) {
        return accessControl.minimumPricePerBit();
    }

    /// @notice Used by owner to change the fee to gain access to historical data archive
    function setHistoricalDataFee(uint amount) public onlyOwner {
        accounting.setHistoricalDataFee(amount);
    }

    /// @notice Used by owner to change the fee to gain power user privileges
    function setPowerUserClubFee(uint amount) public onlyOwner {
        accounting.setPowerUserClubFee(amount);
    }

    /// @notice Used by owner to change the minimum to retain power user privileges
    function getPowerUserMinimum() public view returns (uint) {
        accessControl.updateGlobalState();
        return accounting.getPowerUserMinimum();
    }

    /// @notice Used by owner to set the usefulness baseline
    function setUsefulnessBaseline(uint8 dec) public onlyOwner {
        accessControl.setUsefulnessBaseline(dec);
    }

    /// @notice Returns the usefulness baseline
    function getUsefulnessBaseline() public returns (uint) {
        return accessControl.getUsefulnessBaseline();
    }

    /// @notice Used by owner to set minimum price per bit of incremental usefulness
    function setMinimumPricePerBit(uint amount) public onlyOwner {
        accessControl.setMinimumPricePerBit(amount);
    }

    /// @notice Used by owner to set total seats available
    function setTotalSeats(uint8 amount) public onlyOwner {
        accessControl.setTotalSeats(amount);
    }

    /// @notice Used by owner to set max percentage of seats occupied by a client
    function setMaxSeatPercentage(uint amount) public onlyOwner {
        accessControl.setMaxSeatPercentage(amount);
    }

    function getMaxSeatPercentage() public view returns (uint, uint) {
        return accessControl.getMaxSeatPercentage();
    }

    /// @dev update the on-chain state of all rental related accounting
    function updateGlobalState() public {
        accessControl.updateGlobalState();
    }
}