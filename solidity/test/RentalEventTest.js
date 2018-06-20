(function () {
    const DeviseToken = artifacts.require("./DeviseToken");
    const DeviseTokenSale = artifacts.require("./DeviseTokenSale");
    const DateTime = artifacts.require("./DateTime");
    const DeviseEternalStorage = artifacts.require("./DeviseEternalStorage");
    const DeviseRentalProxy = artifacts.require("./DeviseRentalProxy");
    const DeviseRentalImpl = artifacts.require("./DeviseRentalImpl");
    const strategies = require('./strategies');
    const {timeTravel, evmSnapshot, evmRevert, timestampToDate} = require('./test-utils');

    const pitai = web3.eth.accounts[0];
    const tokenOwner = web3.eth.accounts[1];
    const tokenWallet = web3.eth.accounts[2];
    const escrowWallet = web3.eth.accounts[3];
    const revenueWallet = web3.eth.accounts[4];
    const clients = web3.eth.accounts.slice(5);
    const microDVZ = 10 ** 6;
    const millionDVZ = 10 ** 6;
    const billionDVZ = 10 ** 9;
    const IUDecimals = 10 ** 6;

    let token;
    let tokensale;
    let rentalProxy;

    async function setupFixtures() {
        const cap = 10 * billionDVZ * microDVZ;
        token = await DeviseToken.new(cap, {from: pitai});
        await token.transferOwnership(tokenOwner, {from: pitai});

        const blockNumber = web3.eth.blockNumber;
        const openingTime = web3.eth.getBlock(blockNumber).timestamp;
        const closingTime = openingTime + 360 * 24 * 60 * 60;
        const initialRate = new web3.BigNumber(16000);
        const finalRate = new web3.BigNumber(8000);
        tokensale = await DeviseTokenSale.new(tokenWallet, initialRate, finalRate, openingTime, closingTime, token.address, {from: pitai});

        // mint 1 billion tokens for token sale
        const saleAmount = 1 * 10 ** 9 * 10 ** 6;
        await token.mint(tokenWallet, saleAmount, {from: tokenOwner});
        await token.approve(tokensale.address, saleAmount, {from: tokenWallet});

        const dateutils = await DateTime.new({from: pitai});
        const dstore = await DeviseEternalStorage.new({from: pitai});
        const proxy = await DeviseRentalProxy.new(token.address, dateutils.address, dstore.address, {from: pitai});

        await dstore.authorize(proxy.address, {from: pitai});

        const rentalImpl = await DeviseRentalImpl.new({from: pitai});

        await proxy.upgradeTo('1.0', rentalImpl.address, {from: pitai});
        await tokensale.setRentalProxy(proxy.address);

        rentalProxy = await DeviseRentalImpl.at(proxy.address);
        await rentalProxy.setEscrowWallet(escrowWallet);
        await rentalProxy.setRevenueWallet(revenueWallet);
    }

    async function findEvent(Tx, eventName) {
        const len = Tx.logs.length;
        for (let i = 0; i < len; i++) {
            if (Tx.logs[i].event == eventName) {
                return i;
            }
        }
        return NaN;
    }

    contract("Test events from the smart contracts", () => {
        beforeEach(setupFixtures);

        it("Should observe the escrow wallet changed event", async () => {
            const tx = await rentalProxy.setEscrowWallet(escrowWallet);
            const eventName = "WalletChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.msg, "The escrow wallet has been changed to ");
            assert.equal(tx.logs[i].args.addr, escrowWallet);
        });

        it("Should observe the revenue wallet changed event", async () => {
            const tx = await rentalProxy.setRevenueWallet(revenueWallet);
            const eventName = "WalletChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.msg, "The revenue wallet has been changed to ");
            assert.equal(tx.logs[i].args.addr, revenueWallet);
        });

        it("Should observe the data contract changed event", async () => {
            const dstore = await DeviseEternalStorage.new({from: pitai});
            const tx = await rentalProxy.setDataContract(dstore.address);
            const eventName = "DataContractChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.addr, dstore.address);
        });

        it("Should observe the beneficiary designated event", async () => {
            const client = clients[0];
            const bene = clients[1];
            const tx = await rentalProxy.designateBeneficiary(bene, {from: client});
            const eventName = "BeneficiaryChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.addr, client);
            assert.equal(tx.logs[i].args.ben, bene);
        });

        it("Should observe the strategy added event", async () => {
            const str = strategies[0];
            const iu = 1000000 * (3);
            const tx = await rentalProxy.addStrategy(str, iu);
            const eventName = "StrategyAdded";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.s, str);
            assert.equal(tx.logs[i].args.iu.toNumber(), iu);
        });

        it("Should observe the lease term updated event", async () => {
            const lt = (await rentalProxy.leaseTerm.call()).toNumber();
            assert.equal(lt, 0);
            await timeTravel(86400 * 180);
            const tx = await rentalProxy.updateLeaseTerms();
            const eventName = "LeaseTermUpdated";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.isAbove(tx.logs[i].args.lt.toNumber(), 5);
        });

        it("Should observe the historical data fee changed", async () => {
            const amt = 100;
            const tx = await rentalProxy.setHistoricalDataFee(amt);
            const eventName = "FeeChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.src, "Historical Data Fee");
            assert.equal(tx.logs[i].args.amt.toNumber(), amt);
        });

        it("Should observe the power user club fee changed", async () => {
            const amt = 100;
            const tx = await rentalProxy.setPowerUserClubFee(amt);
            const eventName = "FeeChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.src, "Power User Club Fee");
            assert.equal(tx.logs[i].args.amt.toNumber(), amt);
        });

        it("Should observe the power user minimum changed", async () => {
            // Pit.AI adds strategies to rental contract
            await rentalProxy.addStrategy(strategies[0], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[1], 1000000 * (300));
            await rentalProxy.addStrategy(strategies[2], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[3], 1000000 * (200));
            await rentalProxy.addStrategy(strategies[4], 1000000 * (100));
            await rentalProxy.addStrategy(strategies[5], 1000000 * (100));
            const tx = await rentalProxy.updateLeaseTerms();
            const eventName = "FeeChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.src, "Power User Minimum");
            assert.equal(tx.logs[i].args.amt.toNumber(), 1200000 * microDVZ);
        });

        it("Should observe the usefulness baseline changed", async () => {
            const amt = 9;
            const tx = await rentalProxy.setUsefulnessBaseline(amt);
            const eventName = "IncrementalUsefulnessPrecisionChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.prec.toNumber(), 10 ** amt);
        });

        it("Should observe the total seats changed event", async () => {
            const amt = 200;
            const tx = await rentalProxy.setTotalSeats(amt);
            const eventName = "TotalSeatsChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.s.toNumber(), amt);
        });

        it("Should observe the total seats per address changed event", async () => {
            const amt = 50;
            const tx = await rentalProxy.setMaxSeatPercentage(amt);
            const eventName = "MaxSeatsPerAddressChanged";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.ts.toNumber(), amt);
        });

        it("Should observe the lease price calculated event", async () => {
            await rentalProxy.updateLeaseTerms();
            await timeTravel(86400 * 63);
            const tx = await rentalProxy.updateLeaseTerms();
            const eventName = "LeasePriceCalculated";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.prc.toNumber(), 1000 * microDVZ);
            assert.equal(tx.logs[i].args.all.toNumber(), 0);
        });

        it("Should observe the auction price set event", async () => {
            await rentalProxy.updateLeaseTerms();
            await timeTravel(86400 * 63);
            const tx = await rentalProxy.updateLeaseTerms();
            const eventName = "AuctionPriceSet";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.isAbove(tx.logs[i].args.leaseTerm.toNumber(), 2);
            assert.equal(tx.logs[i].args.prc.toNumber(), 1000 * microDVZ);
        });

        it("Should observe the renter added event", async () => {
            const client = clients[0];
            await Promise.all(strategies.map(async strategy => await rentalProxy.addStrategy(strategy, IUDecimals * (3))));
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});

            // purchase a lot of tokens
            const ether_amount = 3000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });

            let dvz_amount = millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});

            const prc_per_bit = 5000 * microDVZ;
            const seats = 10;
            const tx = await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
            const eventName = "RenterAdded";
            const i = await findEvent(tx, eventName);
            assert.equal(tx.logs[i].event, eventName);
            assert.equal(tx.logs[i].args.client, client);
        });

        it("Should observe the renter removed event", async () => {
            const client = clients[0];
            await Promise.all(strategies.map(async strategy => await rentalProxy.addStrategy(strategy, IUDecimals * (3))));
            // approve so to recognize revenue
            // 10 million tokens
            const rev_amount = 10 * millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, rev_amount, {from: escrowWallet});

            // purchase a lot of tokens
            const ether_amount = 3000;
            await tokensale.sendTransaction({
                from: client,
                value: web3.toWei(ether_amount, "ether"),
                gas: 1000000
            });

            let dvz_amount = millionDVZ * microDVZ;
            await token.approve(rentalProxy.address, dvz_amount, {from: client});
            await rentalProxy.provision(dvz_amount, {from: client});

            const prc_per_bit = 5000 * microDVZ;
            const seats = 10;
            await rentalProxy.leaseAll(prc_per_bit, seats, {from: client});
            let status = true;
            let counter = 0;
            while (status) {
                console.log(counter);
                await timeTravel(86400 * 31);
                dvz_amount = 1;
                await token.approve(rentalProxy.address, dvz_amount, {from: client});
                const tx = await rentalProxy.provision(dvz_amount, {from: client});
                const eventName = "RenterRemoved";
                const i = await findEvent(tx, eventName);
                if (!isNaN(i)) {
                    assert.equal(tx.logs[i].event, eventName);
                    assert.equal(tx.logs[i].args.client, client);
                    status = false;
                }
                counter++;
            }
        });
    });
})();