pragma solidity ^0.4.23;

import "./AuditStorage.sol";
import "openzeppelin-solidity/contracts/ownership/rbac/RBAC.sol";


contract AuditImpl is AuditStorage, RBAC {
    string public constant ROLE_AUDIT_UPDATER = "audit-updater";
    address public auditUpdater;

    modifier onlyOwner() {
        if (msg.sender != owner) revert();
        _;
    }

    modifier onlyAuditUpdater() {
        checkRole(msg.sender, ROLE_AUDIT_UPDATER);
        _;
    }

    /* Events for DApps to listen to */
    event AuditableEventCreated(bytes20 indexed eventType, string eventRawString, bytes20 contentHash);

    /**
     * @dev adds a rate setter role to an address
     * @param addr address
     */
    function addAuditUpdater(address addr) public onlyOwner {
        removeAuditUpdater(auditUpdater);
        if (!hasRole(addr, ROLE_AUDIT_UPDATER)) {
            addRole(addr, ROLE_AUDIT_UPDATER);
            auditUpdater = addr;
        }
    }

    /**
     * @dev removes the rate setter role from address
     * @param addr address
     */
    function removeAuditUpdater(address addr) public onlyOwner {
        if (hasRole(addr, ROLE_AUDIT_UPDATER)) {
            removeRole(addr, ROLE_AUDIT_UPDATER);
            auditUpdater = 0x0;
        }
    }

    /**
     * @dev Emit an event that latest weights have been updated
     * @param contentHash The hash for the content of the latest weights file
     */
    function createAuditableEvent(bytes20 eventTypeHash, string eventType, bytes20 contentHash) public onlyAuditUpdater {
        emit AuditableEventCreated(eventTypeHash, eventType, contentHash);
    }
}
