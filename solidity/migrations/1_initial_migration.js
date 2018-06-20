const Migrations = artifacts.require("./Migrations.sol");
const TruffleConfig = require('../truffle');

module.exports = async function (deployer, network, accounts) {
    const config = TruffleConfig.networks[network];
    if (config.network_id === 74824) {
        await web3.personal.unlockAccount(config.from, "pitai12345678", 6000);
        await web3.personal.unlockAccount(accounts[1], "pitai12345678", 6000);
        await web3.personal.unlockAccount(accounts[2], "pitai12345678", 6000);
        await web3.personal.unlockAccount(accounts[3], "pitai12345678", 6000);
        for (let i = 1; i < accounts.length; i++) {
            let bal = (await web3.eth.getBalance(accounts[i])).toNumber();
            if (bal <= 20 * 10 ** 18) {
                await web3.eth.sendTransaction({from: config.from, to: accounts[i], value: web3.toWei(20, "ether")});
            }
        }
    }
    deployer.deploy(Migrations);
};
