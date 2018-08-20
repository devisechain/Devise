pragma solidity ^0.4.19;

import "./DeviseRentalImplV2.sol";


contract DeviseRentalImplV3 is DeviseRentalImplV2 {
    uint internal _version;
    uint8 internal seatsAvailable;
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
        masterNode = addr;
    }

    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public onlyMaster {
        require(_incrementalUsefulness > 0);
        var (y, m,) = getCurrentDate();
        uint IUTerm = calculateLeaseTerm(y, m) + 1;
        if (IUTerm > leaseTerm + 1) {
            // Price incrementalUsefulness is to be changed for a term past next term, we need to catchup missing terms first
            updateLeaseTerms();
        }
        permData.addLepton(_lepton, _incrementalUsefulness);
        priceNextTerm.totalIncrementalUsefulness = totalIncrementalUsefulness = totalIncrementalUsefulness.add(_incrementalUsefulness);
    }

    function getVersion() public view returns (uint) {
        return _version;
    }
}
