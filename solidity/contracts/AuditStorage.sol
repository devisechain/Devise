pragma solidity ^0.4.23;

contract AuditStorage {
    // The highest version number among all implementations
    uint internal _highestVersion;

    // Address of the current implementation
    address internal _implementation;

    // A one-to-one mapping from implementation address to
    // a version number
    mapping(address => uint) internal implVersions;
    // A history of all implementations. It is possible to
    // have duplicate implementations as the same implementation
    // has been pointed to at different occasions
    address[] internal implHistory;

    address public owner;
}
