pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title TimedInitialSale
 * @dev Crowdsale accepting contributions only within a time frame.
 */
contract TimedInitialSale is Crowdsale {
    using SafeMath for uint256;

    uint256 public openingTime;
    uint256 public closingTime;

    /**
     * @dev Reverts if not in crowdsale time range.
     */
    modifier onlyWhileOpen {
        // solium-disable-next-line security/no-block-members
        uint256 currentTimeStamp = getCurrentTimeStamp();
        require(currentTimeStamp >= openingTime && currentTimeStamp <= closingTime);
        _;
    }

    /**
     * @dev Constructor, takes crowdsale opening and closing times.
     * @param _openingTime Crowdsale opening time
     * @param _closingTime Crowdsale closing time
     */
    constructor(uint256 _openingTime, uint256 _closingTime) public {
        // solium-disable-next-line security/no-block-members
        //        require(_openingTime >= block.timestamp);
        require(_closingTime >= _openingTime);

        openingTime = _openingTime;
        closingTime = _closingTime;
    }

    /**
     * @dev Checks whether the period in which the crowdsale is open has already elapsed.
     * @return Whether crowdsale period has elapsed
     */
    function hasClosed() public view returns (bool) {
        // solium-disable-next-line security/no-block-members
        uint256 currentTimeStamp = getCurrentTimeStamp();
        return currentTimeStamp > closingTime;
    }

    /**
     * @dev Extend parent behavior requiring to be within contributing period
     * @param _beneficiary Token purchaser
     * @param _weiAmount Amount of wei contributed
     */
    function _preValidatePurchase(
        address _beneficiary,
        uint256 _weiAmount
    )
    internal
    onlyWhileOpen
    {
        super._preValidatePurchase(_beneficiary, _weiAmount);
    }

    function getCurrentTimeStamp() internal view returns (uint256) {
        return block.timestamp;
    }

}


