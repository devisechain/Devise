pragma solidity ^0.4.19;

import "./TimeTravel.sol";
import "../AccessControlImpl.sol";


contract AccessControlImplTimeTravel is AccessControl {
    TimeTravel internal timeTravel;

    function setTimeTravel(TimeTravel _timeTravel) public onlyOwner {
        timeTravel = _timeTravel;
    }

    function getCurrentDate() internal returns (uint _year, uint _month, uint _day) {
        uint tt = timeTravel.currentTimeStamp();
        uint _timestamp = tt > block.timestamp ? tt : block.timestamp;
        uint year = dateUtils.getYear(_timestamp);
        uint month = dateUtils.getMonth(_timestamp);
        uint day = dateUtils.getDay(_timestamp);
        return (year, month, day);
    }

}