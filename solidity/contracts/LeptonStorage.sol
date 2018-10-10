pragma solidity ^0.4.19;

import "./AuthorizedOnly.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract LeptonStorage is AuthorizedOnly {
    using SafeMath for uint256;

    struct LeptonPrice {
        bytes20 lepton;
        uint incrementalUsefulness;
    }

    uint public totalIncrementalUsefulness;
    mapping(bytes20 => uint256) public leptons;
    // an array of lepton prices to loop through
    // accessible from derived contract
    LeptonPrice[] internal leptonPrices;
    uint8 internal usefulnessDecimals = 6;
    uint32 internal usefulnessBaseline = uint32(10 ** uint256(usefulnessDecimals));

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        return leptonPrices.length;
    }

    /// @notice Add a lepton to the chain, to be called by the contract owners as leptons are mined and selected
    /// @param _lepton A sha1 lepton hash
    /// @param _prevLepton The previous sha1 lepton hash in the chain
    /// @param _incrementalUsefulness The incremental usefulness added by the lepton being added
    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public onlyAuthorized {
        require(_incrementalUsefulness > 0);
        uint numLeptons = getNumberOfLeptons();
        if (numLeptons > 0) {
            var (prevHash,) = getLepton(numLeptons - 1);
            if (prevHash != _prevLepton)
                revert("Previous lepton does not match the last lepton in the chain!");
        }
        if (leptons[_lepton] != 0)
            revert("Duplicate lepton!");

        _addLepton(_lepton, _incrementalUsefulness);
        leptons[_lepton] = getNumberOfLeptons();
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (bytes20 leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public returns (bytes20, uint) {
        return (leptonPrices[index].lepton, leptonPrices[index].incrementalUsefulness);
    }

    // LeptonWarehouse related interfaces
    function _addLepton(bytes20 _lepton, uint _incrementalUsefulness) internal {
        addLeptonEx(_lepton, _incrementalUsefulness);
        totalIncrementalUsefulness = totalIncrementalUsefulness.add(_incrementalUsefulness);
    }

    function addLeptonEx(bytes20 _lepton, uint _incrementalUsefulness) internal {
        LeptonPrice memory spNew = LeptonPrice(_lepton, _incrementalUsefulness);
        leptonPrices.push(spNew);
    }
}
