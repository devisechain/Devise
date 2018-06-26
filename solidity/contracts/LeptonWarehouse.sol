pragma solidity ^0.4.19;


contract LeptonWarehouse {
    struct LeptonPrice {
        string lepton;
        uint incrementalUsefulness;
    }

    // an array of lepton prices to loop through
    // accessible from derived contract
    LeptonPrice[] internal leptonPrices;

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        return leptonPrices.length;
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (string leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public returns (bytes20, bytes20, uint) {
        uint e = leptonPrices[index].incrementalUsefulness;
        bytes20 sl = stringToBytes20Low(leptonPrices[index].lepton);
        bytes20 sh = stringToBytes20High(leptonPrices[index].lepton);
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

    function addLeptonEx(string _lepton, uint _usefulness) internal {
        LeptonPrice memory spNew = LeptonPrice(_lepton, _usefulness);
        leptonPrices.push(spNew);
    }
}
