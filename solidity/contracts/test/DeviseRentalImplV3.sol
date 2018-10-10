pragma solidity ^0.4.19;

import "./DeviseRentalImplV2.sol";


contract DeviseRentalImplV3 is DeviseRentalImplV2 {
    using SafeMath for uint;

    uint internal _version;
    uint internal totalIncrementalUsefulness;
    string internal test;
    address masterNode;

    modifier onlyMaster() {
        if (masterNode == 0x0 || msg.sender != masterNode) revert();
        _;
    }

    function getAllowance_v2() public returns (uint) {
        return getAllowance();
    }

    function getTest() public returns (string) {
        return test;
    }

    function setVersion(uint _ver) public {
        _version = _ver;
    }

    function setMasterNode(address addr) public onlyOwner {
        leptonProxy.addMasterNode(addr);
        masterNode = addr;
    }

    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public onlyMaster {
        accessControl.updateGlobalState();
        leptonProxy.addLepton(_lepton, _prevLepton, _incrementalUsefulness);
    }

    function getVersion() public view returns (uint) {
        return _version;
    }
}
