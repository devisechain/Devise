pragma solidity ^0.4.19;

import "./RBACMintableToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";
import "./CappedToken.sol";


contract DeviseToken is CappedToken, BurnableToken, RBACMintableToken {
    string public name = "DEVISE";
    string public symbol = "DVZ";
    // The pricision is set to micro DVZ
    uint8 public decimals = 6;

    function DeviseToken(uint256 _cap) public
    CappedToken(_cap) {
        addMinter(owner);
    }

    /**
     * @dev Allows the current owner to transfer control of the contract to a newOwner.
     * @param newOwner The address to transfer ownership to.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        removeMinter(owner);
        addMinter(newOwner);
        super.transferOwnership(newOwner);
    }
}
