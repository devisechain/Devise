pragma solidity ^0.4.19;

import "./Proxy.sol";
import "./DateTime.sol";
import "./DeviseRentalStorage.sol";
import "./DeviseToken.sol";
import "./DeviseEternalStorage.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract DeviseRentalProxy is Proxy, DeviseRentalStorage {
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier whenNotPaused() {
        require(!paused);
        _;
    }

    modifier whenPaused() {
        require(paused);
        _;
    }

    /// @dev This event will be emitted every time the implementation gets upgraded
    /// @param version representing the version name of the upgraded implementation
    /// @param implementation representing the address of the upgraded implementation
    event Upgraded(string version, address indexed implementation);
    event ContractPaused();
    event ContractUnpaused();

    /// @notice Contract constructor
    /// @param _token The token contract to be accepted to pay for lease dues
    /// @param _dateUtils A valid DateTime contract for date manipulation
    function DeviseRentalProxy(DeviseToken _token, DateTime _dateUtils, DeviseEternalStorage _permData) public {
        owner = msg.sender;
        token = _token;
        dateUtils = _dateUtils;
        permData = _permData;
        priceCurrentTerm.pricePerBitOfIU = minimumPricePerBit;
        priceNextTerm.pricePerBitOfIU = minimumPricePerBit;
        seatsAvailable = totalSeats;
    }

    /**
     * @dev called by the owner to pause, triggers stopped state
     */
    function pause() public onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused();
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    function unpause() public onlyOwner whenPaused {
        paused = false;
        emit ContractUnpaused();
    }

    /// @dev Allows the owner to upgrade the current version of the proxy.
    /// @param version representing the version name of the new implementation to be set.
    /// @param implementation representing the address of the new implementation to be set.
    function upgradeTo(string version, address implementation) public onlyOwner {
        require(_implementation != implementation);
        _version = version;
        _implementation = implementation;
        Upgraded(version, implementation);
    }

    /// @dev Gets the address of the current implementation
    /// @return address of the current implementation
    function implementation() public view returns (address) {
        return _implementation;
    }

    /// @dev Gets the version of the current implementation
    /// @return address of the current implementation
    function version() public view returns (string) {
        return _version;
    }

    /// @notice
    /// @param
    function setDataContract(DeviseEternalStorage _add) public onlyOwner {
        address _impl = implementation();
        require(_impl != address(0));

        // call the corresponding function in implementation contract
        // and return values when appropriate
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice transfers `(_amount)` from the token contract to the internal ledger for use to pay for lease
    /// @param _amount The number of tokens to allow for payment of lease dues
    function provision(uint256 _amount) public whenNotPaused {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("provision(uint256)")), _amount))
            revert();
    }

    /// @notice apply for access to power user only data
    function applyForPowerUser() public whenNotPaused returns (bool) {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("applyForPowerUser()"))))
            revert();
    }

    /// @notice Gain access to historical data download for all the leptons
    function requestHistoricalData() public whenNotPaused {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("requestHistoricalData()"))))
            revert();
    }

    /// @notice Designate an address to be authorized to consume the leased data on behalf of sender
    /// @param _beneficiary A beneficiary address
    function designateBeneficiary(address _beneficiary) public whenNotPaused {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("designateBeneficiary(address)")), _beneficiary))
            revert();
    }

    /// @notice Bid for a number of seats up to a limit price per bit of information
    function leaseAll(uint limitPrice, uint8 _seats) public whenNotPaused returns (bool) {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("leaseAll(uint256,uint8)")), limitPrice, _seats))
            revert();
    }

    /// @notice Withdraw tokens back from the lease allowance to the Token contract
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint amount) public whenNotPaused {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("withdraw(uint256)")), amount))
            revert();
    }

    /// @notice Used by owner to change the fee to gain access to historical data archive
    function setHistoricalDataFee(uint amount) public onlyOwner {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("setHistoricalDataFee(uint256)")), amount))
            revert();
    }

    /// @notice Used by owner to change the fee to gain power user privileges
    function setPowerUserClubFee(uint amount) public onlyOwner {
        address _impl = implementation();
        require(_impl != address(0));

        if (!_impl.delegatecall(bytes4(keccak256("setPowerUserClubFee(uint256)")), amount))
            revert();
    }

    /// @notice Get the beneficiary address designated by the current sender to receive the leased data
    function getBeneficiary() public view returns (address) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the money account address for which the current sender is a beneficiary
    function getClientForBeneficiary() public view returns (address) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the beneficiary address designated by the `(_client)` to receive the leased data
    /// @param _client the address of the client for which to return the beneficiary
    function getClientSummary(address _client) public view
    returns (address, uint, uint, bool, bool, uint, uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Updates and returns the current lease allowance in tokens of the `message.caller.address()`
    /// @return The allowance of the message sender
    function getAllowance() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the total incremental usefulness of the blockchain
    /// @return the total incremental usefulness of the blockchain
    function getTotalIncrementalUsefulness() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the prevailing price for the current lease term
    function getRentPerSeatCurrentTerm() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the current prevailing price for the next lease term
    function getIndicativeRentPerSeatNextTerm() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Check if `message.caller.address()` is a power user
    /// @return true if user is a power user, false otherwise
    function isPowerUser() public view returns (bool) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the number of currently active renters
    function getNumberOfRenters() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the renter address at `(index)`
    /// @param index the index for which to return the renter address
    function getRenter(uint index) public view returns (address) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the number of clients
    function getNumberOfClients() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the client address at `(index)`
    /// @param index the index for which to return the client address
    function getClient(uint index) public view returns (address) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get number of currently available seats for the current lease term
    function getSeatsAvailable() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice get the client with the current highest bid
    function getHighestBidder() public view returns (address, uint8, uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice get the client with the highest bid after the current client
    /// @param _client the client after which to get the next highest bidder
    function getNextHighestBidder(address _client) public view returns (address, uint8, uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (string leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public view returns (string, string, uint) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }

    function getDataContract() public view returns (address) {
        address _impl = implementation();
        require(_impl != address(0));

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 {revert(ptr, size)}
            default {return (ptr, size)}
        }
    }
}
