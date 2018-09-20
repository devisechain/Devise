pragma solidity ^0.4.19;

import "../DeviseRentalImpl.sol";


contract DeviseRentalImplTest is DeviseRentalImpl {
    modifier onlyTest() {
        if (msg.sender != owner) revert();
        _;
    }

    function mockCurrentTotalUsefulness() public onlyTest {
        priceCurrentTerm.totalIncrementalUsefulness = priceNextTerm.totalIncrementalUsefulness;
    }

    function getPowerUserMinimum() public view returns (uint) {
        return powerUserMinimum;
    }

    function getUsefulnessBaseline() public view returns (uint32) {
        return usefulnessBaseline;
    }

    function getMaxSeatPercentage() public view returns (uint, uint) {
        return (maxSeatPercentage, maxSeatMultiple);
    }
}
