pragma solidity ^0.4.19;

import "../DeviseRentalImpl.sol";
import "./TimeTravel.sol";


contract DeviseRentalImplTimeTravel is DeviseRentalImpl {
    TimeTravel internal timeTravel;

    function setTimeTravel(TimeTravel _timeTravel) public onlyOwner {
        timeTravel = _timeTravel;
    }

    function _getCurrentDate() internal returns (uint _year, uint _month, uint _day) {
        uint tt = timeTravel.currentTimeStamp();
        uint _timestamp = tt > block.timestamp ? tt : block.timestamp;
        uint year = dateUtils.getYear(_timestamp);
        uint month = dateUtils.getMonth(_timestamp);
        uint day = dateUtils.getDay(_timestamp);
        return (year, month, day);
    }
}
