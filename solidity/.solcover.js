module.exports = {
    port: 6545,
    testrpcOptions: '-p 6545 -u 0x54fd80d6ae7584d8e9a19fe1df43f04e5282cc43 -e 1000000 -a 20 ',
    testCommand: 'truffle test',
    norpc: false,
    copyPackages: ['openzeppelin-solidity']
};
