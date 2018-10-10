pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./DateTime.sol";
import "./AccessControlStorage.sol";
import "./DeviseToken.sol";


contract DeviseRentalStorage {
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
    bool public paused = false;
    address public escrowWallet;
    address[] internal escrowHistory;
    address public revenueWallet;
    address[] internal revenueHistory;

    DeviseToken internal token;
    DateTime internal dateUtils;
    AccessControlStorage internal permData;
}