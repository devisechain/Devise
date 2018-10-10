pragma solidity ^0.4.23;

import "./AuthorizedOnly.sol";


/**
 * @title AccountingStorage
 * @dev Standalone storage contract containing the accounting states, including client lists, and escrow balances.
 */
contract AccountingStorage is AuthorizedOnly {
    struct Allowance {
        uint balance;
        uint leaseTermPaid;
        bool isPowerUser;
        bool canAccessHistoricalData;
    }

    struct Client {
        bool isClient;
        address beneficiary;
        Allowance allowance;
    }

    // a mapping of client addresses to client structs
    mapping(address => Client) internal clients;
    // the list of client addresses
    address[] internal clientsArray;

    /// @dev adds a new client to the list of clients and mapping
    function addClient(address client) public onlyAuthorized {
        clientsArray.push(client);
        clients[client].isClient = true;
    }

    /// @dev checks if an address is a client
    function isClient(address client) public view returns (bool) {
        return clients[client].isClient;
    }

    /// @dev returns a list of all client addresses
    function getClients() public view returns (address[]) {
        return clientsArray;
    }

    /// @dev gets the client address at the specified index
    function getClient(uint index) public view returns (address) {
        return clientsArray[index];
    }

    /// @dev gets the number of client addresses int the clients array
    function getNumberOfClients() public view returns (uint) {
        return clientsArray.length;
    }

    /// @dev gets the escrow balance of a client by address
    function getAllowance(address client) public view returns (uint allowance) {
        return clients[client].allowance.balance;
    }

    /// @dev sets the escrow balance of a client by address
    function setAllowance(address client, uint balance) public onlyAuthorized {
        clients[client].allowance.balance = balance;
    }

    /// @dev gets the last lease term paid by a client by address
    function getLastLeaseTermPaid(address client) public view returns (uint) {
        return clients[client].allowance.leaseTermPaid;
    }

    /// @dev sets the last lease term paid by a client by address
    function setLastLeaseTermPaid(address client, uint leaseTerm) public onlyAuthorized {
        clients[client].allowance.leaseTermPaid = leaseTerm;
    }

    /// @dev gets the beneficiary address of a client by address
    function getBeneficiary(address client) public view returns (address) {
        return clients[client].beneficiary;
    }

    /// @dev sets the beneficiary address of a client by address
    function setBeneficiary(address client, address beneficiary) public onlyAuthorized {
        clients[client].beneficiary = beneficiary;
    }

    /// @dev gets the power user status of a client by address
    function isPowerUser(address client) public view returns (bool) {
        return clients[client].allowance.isPowerUser;
    }

    /// @dev sets the power user status of a client by address
    function setPowerUser(address client, bool status) public onlyAuthorized {
        clients[client].allowance.isPowerUser = status;
    }

    /// @dev gets the historical data access status of a client by address
    function canAccessHistoricalData(address client) public view returns (bool) {
        return clients[client].allowance.canAccessHistoricalData;
    }

    /// @dev sets the historical data access status of a client by address
    function setCanAccessHistoricalData(address client, bool status) public onlyAuthorized {
        clients[client].allowance.canAccessHistoricalData = status;
    }
}
