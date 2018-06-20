pragma solidity ^0.4.19;

import "../DeviseRentalImpl.sol";


contract DeviseRentalImplV2 is DeviseRentalImpl {

    function provision(uint _amount) public require(_amount > 0) {
        super.provision(_amount - 2);
    }

}
