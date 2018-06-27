pragma solidity ^0.4.19;

import "../DeviseTokenSaleBase.sol";
import "./TimeTravel.sol";


contract TokenSaleTimeTravel is DeviseTokenSaleBase {
    TimeTravel public timeTravel;

    function TokenSaleTimeTravel(address _wallet, uint256 _initialRate, uint256 _finalRate, uint256 _openingTime, uint256 _closingTime, DeviseToken _token) public
    DeviseTokenSaleBase(_wallet, _initialRate, _finalRate, _openingTime, _closingTime, _token) {
    }

    function setTimeTravel(TimeTravel _timeTravel) public onlyOwner {
        timeTravel = _timeTravel;
    }

    function getCurrentTimeStamp() internal view returns (uint256) {
        return timeTravel.currentTimeStamp();
    }
}
