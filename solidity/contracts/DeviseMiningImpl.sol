pragma solidity ^0.4.19;

import "./DeviseMiningStorage.sol";
import "openzeppelin-solidity/contracts/ownership/rbac/RBAC.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./DeviseRentalImpl.sol";


contract DeviseMiningImpl is DeviseMiningStorage, AuthorizedOnly, RBAC {
    using SafeMath for uint256;

    string public constant ROLE_MASTER_NODE = "master-node";
    address[] public masterNodes;
    //    mapping(bytes20 => uint256) public leptons;

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    modifier onlyMasterNodes() {
        checkRole(msg.sender, ROLE_MASTER_NODE);
        _;
    }

    event LeptonAdded(bytes20 s, uint iu);

    /// @notice Get the total incremental usefulness of the blockchain
    /// @return the total incremental usefulness of the blockchain
    function getTotalIncrementalUsefulness() public view returns (uint) {
        return permData.totalIncrementalUsefulness();
    }

    /// @notice Add a lepton to the chain, to be called by the contract owners as leptons are mined and selected
    /// @param _lepton A sha1 lepton hash
    /// @param _prevLepton The previous sha1 lepton hash in the chain
    /// @param _incrementalUsefulness The incremental usefulness added by the lepton being added
    function addLepton(bytes20 _lepton, bytes20 _prevLepton, uint _incrementalUsefulness) public onlyAuthorized {
        permData.addLepton(_lepton, _prevLepton, _incrementalUsefulness);
        emit LeptonAdded(_lepton, _incrementalUsefulness);
    }

    /**
     * @dev adds the master node role to an address
     * @param addr address
     */
    function addMasterNode(address addr) public onlyAuthorized {
        if (!hasRole(addr, ROLE_MASTER_NODE)) {
            addRole(addr, ROLE_MASTER_NODE);
            masterNodes.push(addr);
        }
    }

    /// Get all leptons
    /// @return bytes20[], uint[]
    function getAllLeptons() public view returns (bytes20[], uint[]) {
        uint numLeptons = permData.getNumberOfLeptons();
        bytes20[] memory hashes = new bytes20[](numLeptons);
        uint[] memory ius = new uint[](numLeptons);
        for (uint x = 0; x < numLeptons; x++) {
            var (hash, iu) = permData.getLepton(x);
            hashes[x] = hash;
            ius[x] = iu;
        }
        return (hashes, ius);
    }

    /// @notice Get the current number of leptons
    function getNumberOfLeptons() public view returns (uint) {
        return permData.getNumberOfLeptons();
    }

    /// @notice Get the lepton and incremental usefulness at the specified index
    /// @param index the index for which to return the lepton and incremental usefulness
    /// @return (string, string leptonHash, uint incremental_usefulness * 1e9)
    function getLepton(uint index) public view returns (bytes20, uint) {
        return permData.getLepton(index);
    }

    /**
     * @dev removes the master node role from address
     * @param addr address
     */
    function removeMasterNode(address addr) public onlyAuthorized {
        if (hasRole(addr, ROLE_MASTER_NODE)) {
            removeRole(addr, ROLE_MASTER_NODE);
            removeMasterNodeByValue(addr);
        }
    }

    /**
     * @dev returns all current master nodes
     */
    function getMasterNodes() public constant returns (address[]) {
        return masterNodes;
    }

    function isMasterNode(address addr) public view returns (bool) {
        return hasRole(addr, ROLE_MASTER_NODE);
    }

    /*
     * Start of internal functions
     */
    /**
     * @dev removes a master node from the master nodes array
     */
    function removeMasterNodeByValue(address addr) internal {
        for (uint i; i < masterNodes.length; i++) {
            if (masterNodes[i] == addr) {
                if (masterNodes.length > 1) {
                    // copy last element into this address spot and shrink array
                    masterNodes[i] = masterNodes[masterNodes.length - 1];
                    masterNodes.length--;
                } else
                    masterNodes.length = 0;

                return;
            }
        }
    }
}
