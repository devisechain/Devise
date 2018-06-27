const DeviseTokenSale = artifacts.require("./DeviseTokenSaleBase");
const DeviseToken = artifacts.require("./DeviseToken");

let token;
let tokensale;
const pitai = web3.eth.accounts[0];

contract("Token sale when open", () => {
    before(async () => {
        // 10 billion tokens and 6 decimals precision
        const cap = 10 * 10 ** 9 * 10 ** 6;
        token = await DeviseToken.new(cap, {from: pitai});

        const initialRate = new web3.BigNumber(16000);
        const finalRate = new web3.BigNumber(8000);
        // 05/01/2018 12:00:00am
        const openingTime = 1525132800;
        // 10/01/2019 12:00:00am
        const closingTime = 1569888000;
        tokensale = await DeviseTokenSale.new(pitai, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});
    });
});