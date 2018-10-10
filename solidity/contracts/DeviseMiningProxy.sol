pragma solidity ^0.4.19;

import "./DeviseMiningStorage.sol";
import "./LeptonStorage.sol";
import "./OwnedUpgradeabilityProxy.sol";
import "./AuthorizedOnly.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract DeviseMiningProxy is OwnedUpgradeabilityProxy, DeviseMiningStorage, AuthorizedOnly {
    using SafeMath for uint256;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /// @dev This event will be emitted every time the implementation gets upgraded
    /// @param version representing the version number of the upgraded implementation
    /// @param implementation representing the address of the upgraded implementation
    event Upgraded(uint version, address indexed implementation);

    function DeviseMiningProxy(LeptonStorage _permData) public {
        owner = msg.sender;
        permData = _permData;
    }

    /// @dev Allows the owner to upgrade the current version of the proxy.
    /// @param implementation representing the address of the new implementation to be set.
    function upgradeTo(address implementation) public onlyOwner {
        require(_implementation != implementation);
        if (implVersions[implementation] == 0) {
            _highestVersion = _highestVersion.add(1);
            implVersions[implementation] = _highestVersion;
        }
        _implementation = implementation;
        implHistory.push(implementation);
        uint ver = implVersions[implementation];
        Upgraded(ver, implementation);
    }

    /// @dev Gets the address of the current implementation
    /// @return address of the current implementation
    function implementation() public view returns (address) {
        return _implementation;
    }
}
