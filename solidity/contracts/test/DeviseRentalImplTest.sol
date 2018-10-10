pragma solidity ^0.4.19;

import "../DeviseRentalImpl.sol";


contract DeviseRentalImplTest is DeviseRentalImpl {
    modifier onlyTest() {
        if (msg.sender != owner) revert();
        _;
    }

    function mockCurrentTotalUsefulness() public onlyTest {
    }

}
