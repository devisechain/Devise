pragma solidity ^0.4.19;

import "./DeviseTokenSaleBase.sol";


contract DeviseTokenSale is DeviseTokenSaleBase {
    function DeviseTokenSale(address _wallet, uint256 _initialRate, uint256 _finalRate, uint256 _openingTime, uint256 _closingTime, DeviseToken _token) public
    DeviseTokenSaleBase(_wallet, _initialRate, _finalRate, _openingTime, _closingTime, _token) {
        enableWhitelist = true;
    }
}
