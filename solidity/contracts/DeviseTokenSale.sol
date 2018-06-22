pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/crowdsale/emission/AllowanceCrowdsale.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./DeviseToken.sol";
import "./IncreasingPriceInitialSale.sol";
import "./DeviseRentalProxy.sol";


contract DeviseTokenSale is AllowanceCrowdsale, IncreasingPriceInitialSale {
    using SafeMath for uint256;
    uint8 internal decimals;
    DeviseRentalProxy public rental;
    address internal owner;

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    function DeviseTokenSale(address _wallet, uint256 _initialRate, uint256 _finalRate, uint256 _openingTime, uint256 _closingTime, DeviseToken _token) public
    AllowanceCrowdsale(_wallet)
    IncreasingPriceInitialSale(_initialRate, _finalRate)
    TimedInitialSale(_openingTime, _closingTime)
    Crowdsale(_initialRate, _wallet, _token) {
        decimals = _token.decimals();
        require(decimals <= 18);
        owner = msg.sender;
    }

    function setRentalProxy(DeviseRentalProxy _rental) public onlyOwner {
        rental = _rental;
    }

    function hasMinimumOrderSize(uint256 _weiAmount) public view returns (bool, uint tokens, uint ethers) {
        require(rental != address(0x0));
        rate = getCurrentRate();
        uint microDVZ = _weiAmount.mul(rate).div(10 ** uint256(18 - decimals));
        uint rent = rental.getRentPerSeatCurrentTerm();
        return (microDVZ >= rent, rent, rent / rate);
    }

    /**
     * @dev Validation of an incoming purchase. Use require statements to revert state when conditions are not met. Use super to concatenate validations.
     * @param _beneficiary Address performing the token purchase
     * @param _weiAmount Value in wei involved in the purchase
     */
    function _preValidatePurchase(
        address _beneficiary,
        uint256 _weiAmount
    )
    internal
    onlyWhileOpen
    {
        require(rental != address(0x0));
        rate = getCurrentRate();
        uint microDVZ = _weiAmount.mul(rate).div(10 ** uint256(18 - decimals));
        uint rent = rental.getRentPerSeatCurrentTerm();
        require(microDVZ >= rent);
        require(microDVZ > 0);
        super._preValidatePurchase(_beneficiary, _weiAmount);
    }

    /**
     * @dev Use ether/DVZ conversion
     * @param _weiAmount Value in wei to be converted into tokens
     * @return Number of tokens that can be purchased with the specified _weiAmount
     */
    function _getTokenAmount(uint256 _weiAmount)
    internal view returns (uint256)
    {
        rate = getCurrentRate();
        return _weiAmount.mul(rate).div(10 ** uint256(18 - decimals));
    }
}