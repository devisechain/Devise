module.exports = {
    "timeTravel": async time => {
        await web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time], // 86400 is num seconds in day
            id: new Date().getTime()
        });
        await web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_mine",
            params: [],
            id: new Date().getTime()
        });
    },
    "evmSnapshot": async () => await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_snapshot",
        params: [],
        id: new Date().getTime(),
        "external": true
    }),
    "evmRevert": async (testSnapshotId) => await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_revert",
        params: [testSnapshotId],
        id: new Date().getTime(),
        "external": true
    }),
    "timestampToDate": timestamp => {
        const d = new Date(0);
        d.setUTCSeconds(timestamp);
        return d;
    }
};