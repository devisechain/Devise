pragma solidity ^0.4.19;


contract LeptonWarehouse {
    struct LeptonPrice {
        bytes20 lepton;
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
    /// @return (bytes20 leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public returns (bytes20, uint) {
        return (leptonPrices[index].lepton, leptonPrices[index].incrementalUsefulness);
    }

    function addLeptonEx(bytes20 _lepton, uint _usefulness) internal {
        LeptonPrice memory spNew = LeptonPrice(_lepton, _usefulness);
        leptonPrices.push(spNew);
    }
}
