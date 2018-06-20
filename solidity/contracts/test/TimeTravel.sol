pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract TimeTravel {
    using SafeMath for uint256;

    uint256 public currentTimeStamp;
    address internal owner;

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    function TimeTravel() public {
        currentTimeStamp = block.timestamp;
        owner = msg.sender;
    }

    function timeTravelForward(uint256 sec) public onlyOwner {
        currentTimeStamp = currentTimeStamp.add(sec);
    }
}
