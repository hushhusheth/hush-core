import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { toFixedHex } from "../zkproofs/src/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { ADDRESSES } from "../utils/addresses";

const fromEther = (eth: string) => ethers.utils.parseEther(eth);
const toEther = (wei: BigNumber) => ethers.utils.formatEther(wei);

describe("Wrapped aToken", () => {
    let weth: Contract;
    let wethERC20: Contract;
    let aWeth: Contract;
    let lendingPool: Contract;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let receiver: SignerWithAddress;

    beforeEach(async function () {
        weth = await ethers.getContractAt("IWETH", ADDRESSES["weth"]);
        wethERC20 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["weth"]);
        lendingPool = await ethers.getContractAt("ILendingPool", ADDRESSES["lendingpool"]);
        aWeth = await ethers.getContractAt("AToken", ADDRESSES["aweth"]);

        /*
        let aaveProtocolDataProvider = await ethers.getContractAt(
            "AaveProtocolDataProvider",
            ADDRESSES["aaveprotocoldataprovider"]
        );

        let reserveAddresses = await aaveProtocolDataProvider.getReserveTokensAddresses(ADDRESSES["dai"]);
        let aTokenAddress = reserveAddresses["aTokenAddress"];
        console.log(aTokenAddress);

        */

        [deployer, user, receiver] = await ethers.getSigners();
    });

    describe("Direct deployment checking initialization", async () => {

        let _name = "Wrapped aWETH";
        let _symbol = "WaWETH";
        let watoken: Contract;

        beforeEach(async () => {
            let _asset = weth.address;
            let _lendingpool = lendingPool.address;
            let _aToken = aWeth.address;

            const WATOKEN = await ethers.getContractFactory("WAToken");
            watoken = await WATOKEN.deploy();
            await watoken.deployed();

            await watoken.initialize(_name, _symbol, _asset, _lendingpool, _aToken);
        });

        it("returns the name", async () => {
            expect(await watoken.name()).to.equal(_name);
        });

        it("returns the symbol", async () => {
            expect(await watoken.symbol()).to.equal(_symbol);
        });

        it("returns the decimals", async () => {
            expect(await watoken.decimals()).to.equal(18);
        });

        it("returns the aToken", async () => {
            expect(await watoken.aToken()).to.equal(aWeth.address);
        });

        it("returns the lendingpool", async () => {
            expect(await watoken.lendingPool()).to.equal(lendingPool.address);
        });
    });

    describe("Direct Deployment with aTokens", async () => {
        let _name = "Wrapped aWETH";
        let _symbol = "WaWETH";
        let watoken: Contract;

        let depositAmount = fromEther("1"); // 1 eth to wei

        beforeEach(async () => {
            let _asset = weth.address;
            let _lendingpool = lendingPool.address;
            let _aToken = aWeth.address;

            const WATOKEN = await ethers.getContractFactory("WAToken");
            watoken = await WATOKEN.deploy();
            await watoken.deployed();

            await watoken.initialize(_name, _symbol, _asset, _lendingpool, _aToken);

            // Get WETH
            await weth.connect(user).deposit({ value: depositAmount });
            expect(await wethERC20.balanceOf(user.address)).to.equal(depositAmount, "User balance != depositAmount");

            // Approve weth
            await wethERC20.connect(user).approve(lendingPool.address, depositAmount);
            expect(await wethERC20.allowance(user.address, lendingPool.address)).to.equal(depositAmount);

            // Get aWeth
            await lendingPool.connect(user).deposit(weth.address, depositAmount, user.address, 0);
            expect(await wethERC20.balanceOf(user.address)).to.equal(0);
            expect(await aWeth.balanceOf(user.address)).to.be.at.least(depositAmount);
        });

        describe("With 0 balance", async () => {
            // We will often use at least and greater than below, as the interest accrues it is inconvenient to do exact.

            it("deposit aWeth", async () => {
                // Approve aTokens
                await aWeth.connect(user).approve(watoken.address, depositAmount);
                let allowance: BigNumber = await aWeth.allowance(user.address, watoken.address);
                expect(allowance).to.equal(depositAmount, "Allowance != depositAmount");

                let balanceAPre: BigNumber = await aWeth.balanceOf(user.address);
                expect(balanceAPre.gte(depositAmount)).to.equal(true, "balanceAPre < depositAmount");

                let balanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                expect(balanceWAPre).to.equal(0, "BalanceWAPre != 0");

                await watoken.connect(user).deposit(depositAmount);

                let balanceAPost: BigNumber = await aWeth.balanceOf(user.address);
                expect(balanceAPost.lt(balanceAPre)).to.equal(true, "balanceAPost >= balanceAPre");

                let balanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(balanceWAPost.gt(balanceWAPre)).to.equal(true, "balanceWAPost <= balanceWAPre");

                let balanceWAPostInA = await watoken.balanceATokens(user.address);
                expect(balanceWAPostInA.gte(depositAmount)).to.equal(true, "blanaceWAPostInA < depositAmount");
            });

            it("deposit aWeth to", async () => {
                // Approve aTokens
                await aWeth.connect(user).approve(watoken.address, depositAmount);
                let allowance: BigNumber = await aWeth.allowance(user.address, watoken.address);
                expect(allowance).to.equal(depositAmount, "Allowance != depositAmount");

                let userBalanceAPre: BigNumber = await aWeth.balanceOf(user.address);
                expect(userBalanceAPre.gte(depositAmount)).to.equal(true, "userBalanceAPre < depositAmount");

                let userBalanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                expect(userBalanceWAPre).to.equal(0);

                let receiverBalanceWAPre: BigNumber = await watoken.balanceOf(receiver.address);
                expect(receiverBalanceWAPre).to.equal(0);

                await watoken.connect(user).depositTo(receiver.address, depositAmount);

                let userBalanceAPost: BigNumber = await aWeth.balanceOf(user.address);
                expect(userBalanceAPost.lt(userBalanceAPre)).to.equal(true, "userBalanceAPost >= userBalancePre");

                let userBalanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(userBalanceWAPost).to.equal(userBalanceWAPre);

                let receiverBalanceWAPost: BigNumber = await watoken.balanceOf(receiver.address);
                expect(receiverBalanceWAPost.gt(receiverBalanceWAPre)).to.equal(true, "receiverBalanceWAPost <= receiverBalanceWAPre");

                let receiverBalanceWAPostInA: BigNumber = await watoken.balanceATokens(receiver.address);
                expect(receiverBalanceWAPostInA.gte(depositAmount)).to.equal(true, "receiverBalanceWAPostInA < depositAmount");
            });

        });

        describe("With positive balance", async () => {

            beforeEach(async () => {
                await aWeth.connect(user).approve(watoken.address, depositAmount);
                let allowance: BigNumber = await aWeth.allowance(user.address, watoken.address);
                expect(allowance).to.equal(depositAmount, "Allowance != depositAmount");

                let balanceAPre: BigNumber = await aWeth.balanceOf(user.address);
                expect(balanceAPre.gte(depositAmount)).to.equal(true, "balanceAPre < depositAmount");

                let balanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                expect(balanceWAPre).to.equal(0, "BalanceWAPre != 0");

                await watoken.connect(user).deposit(depositAmount);

                let balanceAPost: BigNumber = await aWeth.balanceOf(user.address);
                expect(balanceAPost.lt(balanceAPre)).to.equal(true, "balanceAPost >= balanceAPre");

                let balanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(balanceWAPost.gt(balanceWAPre)).to.equal(true, "balanceWAPost <= balanceWAPre");

                let balanceWAPostInA = await watoken.balanceATokens(user.address);
                expect(balanceWAPostInA.gte(depositAmount)).to.equal(true, "blanaceWAPostInA < depositAmount");
            });

            it("withdraw", async () => {
                let balanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                let balanceWAPreInA: BigNumber = await watoken.balanceATokens(user.address);
                let balanceAPre: BigNumber = await aWeth.balanceOf(user.address);

                await watoken.connect(user).withdraw(balanceWAPre);

                let balanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(balanceWAPost).to.equal(0, "balanceWAPost != 0");

                let balanceAPost: BigNumber = await aWeth.balanceOf(user.address);
                expect(balanceAPost.gte(balanceAPre.add(balanceWAPreInA))).to.equal(true, "balanceAPost < balanceAPre + balanceWAPreInA");
            });

            it("should not withdraw beyond balance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await expect(watoken.connect(user).withdraw(balance.mul(2))).to.be.revertedWith("ERC20: burn amount exceeds balance");
            });

            it("withdraw to", async () => {
                let userBalanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                let userBalanceWAPreInA: BigNumber = await watoken.balanceATokens(user.address);
                let receiverBalanceAPre: BigNumber = await aWeth.balanceOf(receiver.address);

                await watoken.connect(user).withdrawTo(receiver.address, userBalanceWAPre);

                let userBalanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(userBalanceWAPost).to.equal(0, "balanceWAPost != 0");

                let userBalanceAPost: BigNumber = await aWeth.balanceOf(receiver.address);
                expect(userBalanceAPost.gte(receiverBalanceAPre.add(userBalanceWAPreInA))).to.equal(true, "balanceAPost < balanceAPre + balanceWAPreInA");
            });

            it("should not withdrawTo beyond balance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await expect(watoken.connect(user).withdrawTo(receiver.address, balance.mul(2))).to.be.revertedWith("ERC20: burn amount exceeds balance");
            });

            it("withdraw from", async () => {
                let userBalanceWAPre: BigNumber = await watoken.balanceOf(user.address);
                let userBalanceWAPreInA: BigNumber = await watoken.balanceATokens(user.address);
                let receiverBalanceAPre: BigNumber = await aWeth.balanceOf(receiver.address);

                await watoken.connect(user).approve(receiver.address, userBalanceWAPre);

                await watoken.connect(receiver).withdrawFrom(user.address, receiver.address, userBalanceWAPre);

                let userBalanceWAPost: BigNumber = await watoken.balanceOf(user.address);
                expect(userBalanceWAPost).to.equal(0, "balanceWAPost != 0");

                let userBalanceAPost: BigNumber = await aWeth.balanceOf(receiver.address);
                expect(userBalanceAPost.gte(receiverBalanceAPre.add(userBalanceWAPreInA))).to.equal(true, "balanceAPost < balanceAPre + balanceWAPreInA");
            });

            it("should not withdrawFrom beyond balance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await watoken.connect(user).approve(receiver.address, balance);
                await expect(watoken.connect(receiver).withdrawFrom(user.address, receiver.address, balance.mul(2))).to.be.revertedWith("ERC20: burn amount exceeds balance");
            });

            it("should not withdrawFrom beyond allowance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await watoken.connect(user).approve(receiver.address, balance.div(2));
                await expect(watoken.connect(receiver).withdrawFrom(user.address, receiver.address, balance)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
            });

            it("transfer", async () => {
                let userBalancePre: BigNumber = await watoken.balanceOf(user.address);
                let receiverBalancePre: BigNumber = await watoken.balanceOf(receiver.address);

                let transferAmount = fromEther("0.5");

                await watoken.connect(user).transfer(receiver.address, transferAmount);

                let userBalancePost: BigNumber = await watoken.balanceOf(user.address);
                let receiverBalancePost: BigNumber = await watoken.balanceOf(receiver.address);

                expect(userBalancePost).to.equal(userBalancePre.sub(transferAmount), "userBalancePost != userBalancePre - transferAmount");
                expect(receiverBalancePost).to.equal(receiverBalancePre.add(transferAmount), "receiverBalancePost != receiverBalancePre + transferAmount");
            });

            it("should not transfer beyond balance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await expect(watoken.connect(user).transfer(receiver.address, balance.mul(2))).to.be.revertedWith("ERC20: transfer amount exceeds balance");
            });

            it("transferFrom", async () => {
                let userBalancePre: BigNumber = await watoken.balanceOf(user.address);
                let receiverBalancePre: BigNumber = await watoken.balanceOf(receiver.address);

                let transferAmount = fromEther("0.5");

                await watoken.connect(user).approve(receiver.address, transferAmount);

                await watoken.connect(receiver).transferFrom(user.address, receiver.address, transferAmount);

                let userBalancePost: BigNumber = await watoken.balanceOf(user.address);
                let receiverBalancePost: BigNumber = await watoken.balanceOf(receiver.address);

                expect(userBalancePost).to.equal(userBalancePre.sub(transferAmount), "userBalancePost != userBalancePre - transferAmount");
                expect(receiverBalancePost).to.equal(receiverBalancePre.add(transferAmount), "receiverBalancePost != receiverBalancePre + transferAmount");
            });

            it("should not transferFrom beyond balance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await watoken.connect(user).approve(receiver.address, balance.mul(10));
                await expect(watoken.connect(receiver).transferFrom(user.address, receiver.address, balance.mul(2))).to.be.revertedWith("ERC20: transfer amount exceeds balance");
            });

            it("should not transferFrom beyond allowance", async () => {
                let balance: BigNumber = await watoken.balanceOf(user.address);
                await watoken.connect(user).approve(receiver.address, balance.div(2));
                await expect(watoken.connect(receiver).transferFrom(user.address, receiver.address, balance)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
            });


        });

    });
    describe("Factory deployment", async () => {

        let factory: Contract;
        let dai: Contract;
        let aDai: Contract;

        beforeEach(async () => {
            dai = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["dai"]);
            aDai = await ethers.getContractAt("AToken", ADDRESSES["adai"]);

            const Factory = await ethers.getContractFactory("WATokenFactory");
            factory = await Factory.connect(deployer).deploy(lendingPool.address);
            await factory.deployed();
        });

        it("is owner", async () => {
            expect(await factory.owner()).to.equal(deployer.address, "Owner not matching");
        });

        it("make genesis", async () => {
            let _name = "Wrapped aWETH";
            let _symbol = "WaWETH";

            await factory.genesis(_name, _symbol, weth.address, aWeth.address);

            let watokenAddress = await factory.watokens(aWeth.address);
            expect(watokenAddress).to.be.not.equal(toFixedHex(0, 20), "token has zero address");

            let watoken = await ethers.getContractAt("WAToken", watokenAddress);
            expect(await watoken.aToken()).to.equal(aWeth.address, "aToken address not matching");

            expect(await watoken.name()).to.equal(_name, "Name not matching");
            expect(await watoken.symbol()).to.equal(_symbol, "Symbol not matching");
        });

        it("create extra token", async () => {
            let _name = "Wrapped aWETH";
            let _name2 = "Wrapped aDai";
            let _symbol = "WaWETH";
            let _symbol2 = "WaDai";

            await factory.genesis(_name, _symbol, weth.address, aWeth.address);

            let watokenAddress = await factory.watokens(aWeth.address);
            expect(watokenAddress).to.be.not.equal(toFixedHex(0, 20), "token has zero address");

            let watoken = await ethers.getContractAt("WAToken", watokenAddress);
            expect(await watoken.aToken()).to.equal(aWeth.address, "aToken address not matching");

            expect(await watoken.name()).to.equal(_name, "Name not matching");
            expect(await watoken.symbol()).to.equal(_symbol, "Symbol not matching");

            await factory.deployWAToken(_name2, _symbol2, dai.address, aDai.address);

            let watokenAddress2 = await factory.watokens(aDai.address);
            expect(watokenAddress2).to.be.not.equal(toFixedHex(0, 20), "token has zero address");

            let watoken2 = await ethers.getContractAt("WAToken", watokenAddress2);
            expect(await watoken2.aToken()).to.equal(aDai.address, "aToken address not matching");

            expect(await watoken2.name()).to.equal(_name2, "Name not matching");
            expect(await watoken2.symbol()).to.equal(_symbol2, "Symbol not matching");
        });

    });

    describe("Factory deploy - full execution", async () => {

        let factory: Contract;
        let dai: Contract;
        let aDai: Contract;

        let depositAmount = fromEther("1"); // 1 eth to wei

        let waweth;

        beforeEach(async () => {
            dai = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["dai"]);
            aDai = await ethers.getContractAt("AToken", ADDRESSES["adai"]);

            const Factory = await ethers.getContractFactory("WATokenFactory");
            factory = await Factory.connect(deployer).deploy(lendingPool.address);
            await factory.deployed();

            // Get WETH
            await weth.connect(user).deposit({ value: depositAmount });
            expect(await wethERC20.balanceOf(user.address)).to.equal(depositAmount, "User balance != depositAmount");

            // Approve weth
            await wethERC20.connect(user).approve(lendingPool.address, depositAmount);
            expect(await wethERC20.allowance(user.address, lendingPool.address)).to.equal(depositAmount);

            // Get aWeth
            await lendingPool.connect(user).deposit(weth.address, depositAmount, user.address, 0);
            expect(await wethERC20.balanceOf(user.address)).to.equal(0);
            expect(await aWeth.balanceOf(user.address)).to.be.at.least(depositAmount);

            let _name = "Wrapped aWETH";
            let _name2 = "Wrapped aDai";
            let _symbol = "WaWETH";
            let _symbol2 = "WaDai";

            // Use aDAI as genesis
            await factory.genesis(_name2, _symbol2, dai.address, aDai.address);

            let watokenAddress2 = await factory.watokens(aDai.address);
            expect(watokenAddress2).to.be.not.equal(toFixedHex(0, 20), "token has zero address");

            let watoken2 = await ethers.getContractAt("WAToken", watokenAddress2);
            expect(await watoken2.aToken()).to.equal(aDai.address, "aToken address not matching");

            expect(await watoken2.name()).to.equal(_name2, "Name not matching");
            expect(await watoken2.symbol()).to.equal(_symbol2, "Symbol not matching");

            // Create wAWeth
            await factory.deployWAToken(_name, _symbol, weth.address, aWeth.address);

            let watokenAddress = await factory.watokens(aWeth.address);
            expect(watokenAddress).to.be.not.equal(toFixedHex(0, 20), "token has zero address");

            waweth = await ethers.getContractAt("WAToken", watokenAddress);
            expect(await waweth.aToken()).to.equal(aWeth.address, "aToken address not matching");

            expect(await waweth.name()).to.equal(_name, "Name not matching");
            expect(await waweth.symbol()).to.equal(_symbol, "Symbol not matching");

        });

        it("deposit into second watoken", async () => {
            await aWeth.connect(user).approve(waweth.address, depositAmount);

            let balancePre: BigNumber = await waweth.balanceOf(user.address);
            expect(balancePre).to.equal(0, "balancePre != 0");

            await waweth.connect(user).deposit(depositAmount);

            let balancePost: BigNumber = await waweth.balanceOf(user.address);
            expect(balancePost.gt(0)).to.equal(true, "balancePost <= 0");
        });
    });
});


