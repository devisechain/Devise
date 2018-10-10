pragma solidity ^0.4.23;

import "./AuditStorage.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Proxy.sol";


contract AuditProxy is Proxy, AuditStorage {
    using SafeMath for uint256;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /// @dev This event will be emitted every time the implementation gets upgraded
    /// @param version representing the version number of the upgraded implementation
    /// @param implementation representing the address of the upgraded implementation
    event Upgraded(uint version, address indexed implementation);

    function AuditProxy() public {
        owner = msg.sender;
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

    /// @dev Gets the version of the current implementation
    /// @return address of the current implementation
    function version() public view returns (uint) {
        return implVersions[_implementation];
    }
}
