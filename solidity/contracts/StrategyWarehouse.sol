pragma solidity ^0.4.19;


contract StrategyWarehouse {
    struct StrategyPrice {
        string strategy;
        uint incrementalUsefulness;
    }

    // an array of strategy prices to loop through
    // accessible from derived contract
    StrategyPrice[] internal strategyPrices;

    /// @notice Get the current number of strategies
    function getNumberOfStrategies() public view returns (uint) {
        return strategyPrices.length;
    }

    /// @notice Get the strategy and incremental usefulness at the specified index
    /// @param index the index for which to return the strategy and incremental usefulness
    /// @return (string strategyHash, uint incremental_usefulness * 1e9)
    function getStrategy(uint index) public returns (bytes20, bytes20, uint) {
        uint e = strategyPrices[index].incrementalUsefulness;
        bytes20 sl = stringToBytes20Low(strategyPrices[index].strategy);
        bytes20 sh = stringToBytes20High(strategyPrices[index].strategy);
        return (sh, sl, e);
    }

    function stringToBytes20High(string memory source) private returns (bytes20 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 52))
        }
    }

    function stringToBytes20Low(string memory source) private returns (bytes20 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
    }

    function addStrategyEx(string _strategy, uint _usefulness) internal {
        StrategyPrice memory spNew = StrategyPrice(_strategy, _usefulness);
        strategyPrices.push(spNew);
    }
}
