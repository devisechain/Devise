//noinspection WarnInspections
pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./AccountingStorage.sol";
import "./AccountingProxy.sol";
import "./DeviseToken.sol";
import "./AuthorizedOnly.sol";


/**
 * @title Accounting
 * @dev implementation of the accounting logic.
 * This contract contains all the logic involved in the accounting underlying renting out the Devise chain of leptons.
 */
contract Accounting is AccountingImplStorage, Ownable, Pausable, AuthorizedOnly {
    using SafeMath for uint;

    event BalanceChanged(address clientAddress, string direction, uint amount);
    event CurrentAllowance(uint amount);
    event BeneficiaryChanged(address addr, address ben);
    event FeeChanged(string src, uint amt);

    /// @dev set escrow wallet
    /// @param addr The address of the escrow wallet
    function setEscrowWallet(address addr) public onlyAuthorized {
        require(owner != addr && revenueWallet != addr);
        require(escrowWallet != addr);
        escrowWallet = addr;
    }

    /// @dev set revenue wallet
    /// @param addr The address of the revenue wallet
    function setRevenueWallet(address addr) public onlyAuthorized {
        require(owner != addr && escrowWallet != addr);
        require(revenueWallet != addr);
        revenueWallet = addr;
    }

    /// @dev Used by owner to change the fee to gain access to historical data archive
    function setHistoricalDataFee(uint amount) public onlyAuthorized {
        historicalDataFee = amount;
        FeeChanged("Historical Data Fee", historicalDataFee);
    }

    /// @dev Used by owner to change the fee to gain power user privileges
    function setPowerUserClubFee(uint amount) public onlyAuthorized {
        powerUserClubFee = amount;
        FeeChanged("Power User Club Fee", powerUserClubFee);
    }

    /// @dev transfers `(amount)` from the sender's token wallet to the internal ledger for use to pay for lease
    /// @param sender The sending address from which to take tokens
    /// @param client The client address to increase the balance in escrow for
    /// @param amount The number of tokens to allow for payment of lease dues
    function provisionOnBehalfOf(address sender, address client, uint amount) public whenNotPaused onlyAuthorized {
        require(amount > 0);
        require(escrowWallet != 0x0);
        token.transferFrom(sender, escrowWallet, amount);
        accountingStorage.setAllowance(client, accountingStorage.getAllowance(client).add(amount));
        emit BalanceChanged(client, "increased", amount);
        if (!accountingStorage.isClient(client)) {
            accountingStorage.addClient(client);
        }
        updatePowerUserStatus(client);
    }

    /// @dev Withdraw tokens back from the lease allowance to the Token contract
    /// @param client The client address who wishes to withdraw
    /// @param amount The amount of tokens to withdraw
    function withdraw(address client, uint amount) public whenNotPaused onlyAuthorized {
        uint allowance = accountingStorage.getAllowance(client);
        if (allowance >= amount) {
            accountingStorage.setAllowance(client, allowance.sub(amount));
            token.transferFrom(escrowWallet, client, amount);
            emit BalanceChanged(client, "decreased", amount);
            updatePowerUserStatus(client);
            CurrentAllowance(allowance);
        }
    }

    /// @dev Designate an address to be authorized to consume the leased data on behalf of sender
    /// @param client A client address
    /// @param beneficiary A beneficiary address
    function designateBeneficiary(address client, address beneficiary) public whenNotPaused onlyAuthorized {
        accountingStorage.setBeneficiary(client, beneficiary);
        BeneficiaryChanged(client, beneficiary);
    }

    /// @dev Get the beneficiary address designated by the current sender to receive the leased data
    function getBeneficiary(address client) public view returns (address) {
        address beneficiary = accountingStorage.getBeneficiary(client);
        return beneficiary != 0x0 ? beneficiary : client;
    }

    /// @dev Get the money account address for which the current sender is a beneficiary
    function getClientForBeneficiary(address beneficiary) public view returns (address) {
        address[] memory clients = accountingStorage.getClients();
        for (uint clientIdx = 0; clientIdx < clients.length; clientIdx++) {
            address clientAddress = clients[clientIdx];
            if (accountingStorage.getBeneficiary(clientAddress) == beneficiary)
                return clientAddress;
            if (clientAddress == beneficiary)
                return beneficiary;
        }
        return 0x0;
    }

    /// @dev Get the beneficiary address designated by the `(_client)` to receive the leased data
    /// @param client the address of the client for which to return the beneficiary
    function getClientSummary(address client) public view
    returns (address, uint, uint, uint, bool, bool) {
        require(accountingStorage.isClient(client));
        uint tokenBalance = token.balanceOf(client);

        return (
        getBeneficiary(client),
        accountingStorage.getAllowance(client),
        tokenBalance,
        accountingStorage.getLastLeaseTermPaid(client),
        accountingStorage.isPowerUser(client),
        accountingStorage.canAccessHistoricalData(client)
        );
    }

    /// @dev Updates and returns the current lease allowance in tokens of the `message.caller.address()`
    /// @return The allowance of the message sender
    function getAllowance(address _client) public view returns (uint amount) {
        return accountingStorage.getAllowance(_client);
    }

    /// @dev apply for access to power user only data
    function applyForPowerUser(address client) public whenNotPaused onlyAuthorized returns (bool status) {
        uint allow = accountingStorage.getAllowance(client);
        if (!accountingStorage.isPowerUser(client) && allow >= powerUserMinimum) {
            accountingStorage.setPowerUser(client, true);
            accountingStorage.setAllowance(client, allow.sub(powerUserClubFee));
            recognizeRevenue(powerUserClubFee);
            emit BalanceChanged(client, "decreased", powerUserClubFee);
        }
        return accountingStorage.isPowerUser(client);
    }

    /// @dev Check if `message.caller.address()` is a power user
    /// @return true if user is a power user, false otherwise
    function isPowerUser(address _client) public view returns (bool status) {
        return accountingStorage.isPowerUser(_client);
    }

    /// @dev Gain access to historical data download for all the leptons
    function requestHistoricalData(address client) public whenNotPaused onlyAuthorized {
        applyForPowerUser(client);
        uint allow = accountingStorage.getAllowance(client);
        if (accountingStorage.isPowerUser(client) && !accountingStorage.canAccessHistoricalData(client)) {
            accountingStorage.setAllowance(client, allow.sub(historicalDataFee));
            accountingStorage.setCanAccessHistoricalData(client, true);
            recognizeRevenue(historicalDataFee);
            emit BalanceChanged(client, "decreased", historicalDataFee);
        }
    }

    /// @dev Get the number of clients
    function getNumberOfClients() public view returns (uint) {
        return accountingStorage.getNumberOfClients();
    }

    /// @dev Get the client address at `(index)`
    /// @param index the index for which to return the client's address
    function getClient(uint index) public view returns (address) {
        return accountingStorage.getClient(index);
    }

    /// @dev Get all client addresses
    /// @return address[]
    function getAllClients() public view returns (address[]) {
        return accountingStorage.getClients();
    }

    /// @dev charges a client for a full term's rent
    function deductRent(address clientAddress, uint rent, uint leaseTerm) public onlyAuthorized {
        uint allowance = accountingStorage.getAllowance(clientAddress);
        if (allowance >= rent) {
            accountingStorage.setAllowance(clientAddress, allowance.sub(rent));
            accountingStorage.setLastLeaseTermPaid(clientAddress, leaseTerm);
            recognizeRevenue(rent);
            emit BalanceChanged(clientAddress, "decreased", rent);
            updatePowerUserStatus(clientAddress);
        } else {
            revert();
        }
    }

    /// @dev sets the power user minimum based on the indicative rent specified
    function updatePowerUserMin(uint indicativeRent) public onlyAuthorized {
        powerUserMinimum = indicativeRent > INIT_POWER_USER_MIN ? indicativeRent : INIT_POWER_USER_MIN;
        FeeChanged("Power User Minimum", powerUserMinimum);
    }

    /// @dev returns the current minimum escrow balance required to maintain power user status
    function getPowerUserMinimum() public view returns (uint) {
        return powerUserMinimum;
    }

    /*
    * Internal Functions
    */
    /// @dev updates the power user status of a client based on current allowance and power user minimum
    function updatePowerUserStatus(address _client) internal {
        uint allowance = accountingStorage.getAllowance(_client);
        // if there is no fee, no need to apply
        if (allowance >= powerUserMinimum) {
            if (powerUserClubFee == 0) {
                accountingStorage.setPowerUser(_client, true);
                if (historicalDataFee == 0)
                    accountingStorage.setCanAccessHistoricalData(_client, true);
            }
        } else if (accountingStorage.isPowerUser(_client) || accountingStorage.canAccessHistoricalData(_client)) {
            accountingStorage.setPowerUser(_client, false);
            accountingStorage.setCanAccessHistoricalData(_client, false);
        }
    }

    /// @dev transfers tokens from escrow account to revenue account
    function recognizeRevenue(uint256 amount) internal {
        require(revenueWallet != 0x0);
        token.transferFrom(escrowWallet, revenueWallet, amount);
    }
}