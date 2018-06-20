pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/ownership/rbac/RBAC.sol";


/**
 * @title Mintable token
 * @dev Simple ERC20 Token example, with mintable token creation
 * @dev Issue: * https://github.com/OpenZeppelin/openzeppelin-solidity/issues/120
 * Based on code by TokenMarketNet: https://github.com/TokenMarketNet/ico/blob/master/contracts/MintableToken.sol
 */
contract MintableToken is StandardToken, Ownable {
    event Mint(address indexed to, uint256 amount);
    event MintFinished();

    bool public mintingFinished = false;


    modifier canMint() {
        require(!mintingFinished);
        _;
    }

    modifier hasMintPermission() {
        require(msg.sender == owner);
        _;
    }

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(
        address _to,
        uint256 _amount
    )
    hasMintPermission
    canMint
    public
    returns (bool)
    {
        totalSupply_ = totalSupply_.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        emit Mint(_to, _amount);
        emit Transfer(address(0), _to, _amount);
        return true;
    }

    /**
     * @dev Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() onlyOwner canMint public returns (bool) {
        mintingFinished = true;
        emit MintFinished();
        return true;
    }
}

/**
 * @title Capped token
 * @dev Mintable token with a token cap.
 */
contract CappedToken is MintableToken {

    uint256 public cap;

    constructor(uint256 _cap) public {
        require(_cap > 0);
        cap = _cap;
    }

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(
        address _to,
        uint256 _amount
    )
    onlyOwner
    canMint
    public
    returns (bool)
    {
        require(totalSupply_.add(_amount) <= cap);

        return super.mint(_to, _amount);
    }

}



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
        addRole(minter, ROLE_MINTER);
    }

    /**
     * @dev remove a minter role from an address
     * @param minter address
     */
    function removeMinter(address minter) onlyOwner public {
        removeRole(minter, ROLE_MINTER);
    }

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(
        address _to,
        uint256 _amount
    )
    onlyOwner
    canMint
    public
    returns (bool)
    {
        return super.mint(_to, _amount);
    }
}

contract MintableTokenTestBoth is CappedToken, RBACMintableToken {
    string public name = "DEVISE";
    string public symbol = "DVZ";
    uint8 public decimals = 18;

    function MintableTokenTestBoth(uint256 _cap) public
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


contract MintableTokenTestBoth1 is RBACMintableToken, CappedToken {
    string public name = "DEVISE";
    string public symbol = "DVZ";
    uint8 public decimals = 18;

    function MintableTokenTestBoth1(uint256 _cap) public
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
