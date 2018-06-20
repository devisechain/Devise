// This contract is adapted from RBACMintableToken by OpenZeppelin
pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "openzeppelin-solidity/contracts/ownership/rbac/RBAC.sol";


/**
 * @title RBACMintableToken
 * @author Vittorio Minacori (@vittominacori)
 * @dev Mintable Token, with RBAC minter permissions
 */
contract RBACMintableToken is MintableToken, RBAC {
    /**
     * A constant role name for indicating minters.
     */
    string public constant ROLE_MINTER = "minter";
    address[] internal minters;

    /**
     * @dev override the Mintable token modifier to add role based logic
     */
    modifier hasMintPermission() {
        checkRole(msg.sender, ROLE_MINTER);
        _;
    }

    /**
     * @dev add a minter role to an address
     * @param minter address
     */
    function addMinter(address minter) onlyOwner public {
        if (!hasRole(minter, ROLE_MINTER))
            minters.push(minter);
        addRole(minter, ROLE_MINTER);
    }

    /**
     * @dev remove a minter role from an address
     * @param minter address
     */
    function removeMinter(address minter) onlyOwner public {
        removeRole(minter, ROLE_MINTER);
        removeMinterByValue(minter);
    }

    function getNumberOfMinters() onlyOwner public view returns (uint) {
        return minters.length;
    }

    function getMinter(uint _index) onlyOwner public view returns (address) {
        require(_index < minters.length);
        return minters[_index];
    }

    function removeMinterByIndex(uint index) internal {
        require(minters.length > 0);
        if (minters.length > 1) {
            minters[index] = minters[minters.length - 1];
            // recover gas
            delete (minters[minters.length - 1]);
        }
        minters.length--;
    }

    function removeMinterByValue(address _client) internal {
        for (uint i = 0; i < minters.length; i++) {
            if (minters[i] == _client) {
                removeMinterByIndex(i);
                break;
            }
        }
    }
}
