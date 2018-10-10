pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


/**
 * @title AuthorizedOnly
 * @dev This class provides authorization mechanism for contracts in a generic manner. Each subclass of this contract
 * can authorize addresses as well as list who is authorized to access features protected by the onlyAuthorized modifier
 */
contract AuthorizedOnly is Ownable {
    mapping(address => uint) public authorized;
    address[] public authorizedAddresses;

    modifier onlyAuthorized {
        if (!isAuthorized(msg.sender)) revert();
        _;
    }

    function authorize(address newAddress) public onlyOwner {
        if (!isAuthorized(newAddress)) {
            authorizedAddresses.push(newAddress);
            authorized[newAddress] = authorizedAddresses.length;
        }
    }

    function unauthorize(address oldAddress) public onlyOwner {
        if (isAuthorized(oldAddress)) {
            uint index = authorized[oldAddress] - 1;
            // remove from array
            if (authorizedAddresses.length > 1) {
                authorizedAddresses[index] = authorizedAddresses[authorizedAddresses.length - 1];
                // get some gas back
                delete (authorizedAddresses[authorizedAddresses.length - 1]);
            }
            authorizedAddresses.length--;
            // remove from mapping
            delete authorized[oldAddress];
            assert(!isAuthorized(oldAddress));
        }
    }

    function isAuthorized(address checkAddress) public view returns (bool) {
        return authorized[checkAddress] > 0;
    }
}