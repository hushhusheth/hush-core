import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { zero_value, randomBN, toFixedHex } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { files } from "./../utils/zkfiles";
import { ADDRESSES } from "../utils/addresses";
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';
import { getNamedSigners, getUnnamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

async function printBals(token, tokenname, addresses, labels, decimals) {
    for (let i = 0; i < addresses.length; i++) {
        let bal = await token.balanceOf(addresses[i].address);
        console.log("\t", labels[i], tokenname, "balance: ", toToken(bal, decimals));
    }
};

describe("Complete scenario", () => {

    // What is the full scenario?
    // Deploy 2 watokens, genesis for aDai, and second for aWeth
    // Deploy 2 hush pools, let second pool have 1 eth deposits
    // Deposit a couple of times,
    // Withdraw a couple of times

    // Settings
    let depth = 20;
    let protocolFee = BigNumber.from(0);
    let depositAmount = "1";

    let lendingPool: Contract;
    let weth: Contract;
    let wethERC20: Contract;
    let aWeth: Contract;
    let dai: Contract;
    let aDai: Contract;
    let watokenFactory: Contract;
    let poolFactory: Contract;
    let cEth: Contract;
    let zap: Contract;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let relayer: SignerWithAddress;
    let receiver: SignerWithAddress;
    let feeCollector: SignerWithAddress;

    let cethTree: MerkleTree;
    let wawethTree: MerkleTree;

    beforeEach(async () => {
        await deployments.fixture(["MorePools", "AZap"]);

        lendingPool = await ethers.getContractAt("ILendingPool", ADDRESSES["lendingpool"]);
        weth = await ethers.getContractAt("IWETH", ADDRESSES["weth"]);
        wethERC20 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["weth"]);
        dai = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["dai"]);
        aWeth = await ethers.getContractAt("AToken", ADDRESSES["aweth"]);
        aDai = await ethers.getContractAt("AToken", ADDRESSES["adai"]);
        cEth = await ethers.getContractAt("CEther", ADDRESSES["ceth"]);

        let { deployer: _deployer } = await getNamedSigners(hre);
        deployer = _deployer;
        [user, receiver, relayer, feeCollector] = await getUnnamedSigners(hre);// ethers.getSigners();

        cethTree = new MerkleTree(depth, zero_value);
        cethTree.init();

        wawethTree = new MerkleTree(depth, zero_value);
        wawethTree.init();

        const hushFactoryAddress = (await deployments.get("PoolFactory")).address;
        poolFactory = await ethers.getContractAt("HushFactory", hushFactoryAddress);

        const watokenFactoryAddress = (await deployments.get("TokenFactory")).address;
        watokenFactory = await ethers.getContractAt("WATokenFactory", watokenFactoryAddress);

        const AZapAddress = (await deployments.get("AZap")).address;
        zap = await ethers.getContractAt("AZap", AZapAddress);

        let _depositAmount = fromToken("100");

        // Get WETH to user
        await weth.connect(user).deposit({ value: _depositAmount });
        expect(await wethERC20.balanceOf(user.address)).to.equal(_depositAmount, "User balance != _depositAmount");

        // Approve weth
        await wethERC20.connect(user).approve(lendingPool.address, _depositAmount);
        expect(await wethERC20.allowance(user.address, lendingPool.address)).to.equal(_depositAmount);

        // Get aWeth
        await lendingPool.connect(user).deposit(weth.address, _depositAmount, user.address, 0);
        expect(await wethERC20.balanceOf(user.address)).to.equal(0);
        expect(await aWeth.balanceOf(user.address)).to.be.at.least(_depositAmount);

        // get CEther
        await cEth.connect(user).mint({ value: _depositAmount });

        protocolFee = await poolFactory.feeSize();

        await poolFactory.connect(deployer).setFeeCollector(feeCollector.address);
    });

    it("running", async () => {
        let RUN_WAWETH = true;
        let RUN_CETH = false;

        // Then the scenario begins
        let cEthBalance: BigNumber = await cEth.balanceOf(user.address);
        expect(cEthBalance.gt(0)).to.equal(true, "cEth balance = 0");

        let wawethAddress = await watokenFactory.watokens(aWeth.address);
        let waweth = await ethers.getContractAt("WAToken", wawethAddress);

        let depositAmountCEth = fromToken("50", 8);
        let cethPoolAddress = await poolFactory.getERCPool(cEth.address, depositAmountCEth);
        let cethPool = await ethers.getContractAt("ERCHushPool", cethPoolAddress);

        let depositAmountWeth = fromToken("1", 18);
        let wawethPoolAddress = await poolFactory.getERCPool(waweth.address, depositAmountWeth);
        let wawethPool = await ethers.getContractAt("ERCHushPool", wawethPoolAddress);

        // Deposit funds into waweth
        let aWethBalance: BigNumber = await aWeth.balanceOf(user.address);
        await aWeth.connect(user).approve(waweth.address, aWethBalance.mul(2)); // Remember interest here... otherwise the approve fails
        await waweth.connect(user).deposit(depositAmountWeth.mul(50));

        let bal_user_waweth: BigNumber = await waweth.balanceOf(user.address);

        // console.log("Waweth pool:");
        // console.log("--- Init");
        // await printBals(waweth, "waweth", [user, receiver, relayer, wawethPool], ["User", "Receiver", "Relayer", "Pool"], 18);

        if (RUN_WAWETH) {


            // Deposit into wawethhush pool
            let wawethNotes = [];

            await waweth.connect(user).approve(wawethPool.address, depositAmountWeth.mul(100));
            for (let i = 0; i < 4; i++) {
                let note = new Note(waweth.address, depositAmountWeth);
                note.setIndex(wawethTree.totalElements);
                wawethNotes.push(note);

                const { solidityProof, signals } = await generateDepositProof(note.commitment, wawethTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
                await wawethPool.connect(user).deposit(solidityProof, signals);

                expect(await wawethPool.getLastRoot()).to.equal(wawethTree.root.toString());
                expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(i + 1));
                expect(await wawethPool.leafCount()).to.equal(1 + i);
            }
            expect(await waweth.balanceOf(user.address)).to.equal(bal_user_waweth.sub(depositAmountWeth.mul(4)));

            // Zapping funds
            if (true) {
                let note = new Note(waweth.address, depositAmountWeth);
                note.setIndex(wawethTree.totalElements);
                wawethNotes.push(note);

                const { solidityProof, signals } = await generateDepositProof(note.commitment, wawethTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
                await aWeth.connect(user).approve(zap.address, depositAmountWeth.mul(2));
                await zap.connect(user).deposit(wawethPool.address, solidityProof, signals);

                expect(await wawethPool.getLastRoot()).to.equal(wawethTree.root.toString());
                expect(await wawethPool.leafCount()).to.equal(wawethTree.totalElements);
                expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(5));
            }

            // Zapping funds multiproof, will deposit 7 into the pool
            if (true) {
                let commits = [];
                for (let i = 0; i < 8; i++) {
                    let note = new Note(waweth.address, depositAmountWeth);
                    if (i == 7) {
                        commits.push(zero_value);
                    } else {
                        note.setIndex(wawethTree.totalElements + i);
                        wawethNotes.push(note);
                        commits.push(note.commitment);
                    }
                }

                const { solidityProof, signals } = await generateMultiDepositProof(commits, wawethTree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
                // await wawethPool.connect(user).multiDeposit(solidityProof, signals);

                await aWeth.connect(user).approve(zap.address, depositAmountWeth.mul(9));
                await zap.connect(user).multiDeposit(wawethPool.address, solidityProof, signals);

                expect(await wawethPool.getLastRoot()).to.equal(wawethTree.root.toString());
                expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(wawethTree.totalElements));
                expect(await wawethPool.leafCount()).to.equal(wawethTree.totalElements);
            }

            if (true) {
                let commits = [];
                for (let i = 0; i < 8; i++) {
                    let note = new Note(waweth.address, depositAmountWeth);
                    note.setIndex(wawethTree.totalElements + i);
                    wawethNotes.push(note);
                    commits.push(note.commitment);
                }

                const { solidityProof, signals } = await generateMultiDepositProof(commits, wawethTree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
                await wawethPool.connect(user).multiDeposit(solidityProof, signals);

                expect(await wawethPool.getLastRoot()).to.equal(wawethTree.root.toString());
                expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(wawethTree.totalElements));
                expect(await wawethPool.leafCount()).to.equal(wawethTree.totalElements);
            }

            //console.log("--- After deposits");
            //await printBals(waweth, "waweth", [user, receiver, relayer, wawethPool], ["User", "Receiver", "Relayer", "Pool"], 18);

            // Withdraw to receiver
            let numWithdraws = 1;
            for (let i = wawethNotes.length - 1; i >= wawethNotes.length - numWithdraws; i--) {
                let index = i;
                let note = wawethNotes[index];
                let fee = fromToken("0.001");
                const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, await receiver.getAddress(), fee, wawethTree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

                let bal_receiver_waweth: BigNumber = await waweth.balanceOf(receiver.address);
                let bal_relayer_waweth: BigNumber = await waweth.balanceOf(relayer.address);

                await wawethPool.connect(relayer).withdraw(withdrawProof, withdrawSignals);
                let proFee = depositAmountWeth.mul(protocolFee).div(10000);
                expect(await waweth.balanceOf(receiver.address)).to.equal(bal_receiver_waweth.add(depositAmountWeth.sub(fee.add(proFee))));
                expect(await waweth.balanceOf(relayer.address)).to.equal(bal_relayer_waweth.add(fee));
                expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(wawethTree.totalElements).sub(depositAmountWeth.sub(proFee)));
            }

            //console.log("--- After withdraws");
            //await printBals(waweth, "waweth", [user, receiver, relayer, wawethPool], ["User", "Receiver", "Relayer", "Pool"], 18);
            //console.log("Protocol fees for waweth: ", toToken(await wawethPool.collectedFees()));

            // Unwrap token
            let bal_user_aWeth: BigNumber = await aWeth.balanceOf(receiver.address);
            bal_user_waweth = await waweth.balanceOf(receiver.address);
            //console.log("Receiver weth balance: ", toToken(await aWeth.balanceOf(receiver.address)));
            //console.log("Receiver waweth balance: ", toToken(await waweth.balanceOf(receiver.address)));
            //let bal = await waweth.balanceOf(receiver.address);
            await waweth.connect(receiver).withdraw(bal_user_waweth);

            let bal_user_aWeth_post: BigNumber = await aWeth.balanceOf(receiver.address);
            let bal_user_waweth_post: BigNumber = await waweth.balanceOf(receiver.address);

            expect(bal_user_waweth_post).to.equal(0);
            expect(bal_user_aWeth_post.gt(bal_user_aWeth)).to.equal(true);

            //console.log("Receiver weth balance: ", toToken(await aWeth.balanceOf(receiver.address)));
            //console.log("Receiver waweth balance: ", toToken(await waweth.balanceOf(receiver.address)));


            expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(19).add(depositAmountWeth.mul(protocolFee).div(10000)));
            await wawethPool.connect(feeCollector).collectFees();
            expect(await waweth.balanceOf(wawethPool.address)).to.equal(depositAmountWeth.mul(19));
            expect(await waweth.balanceOf(feeCollector.address)).to.equal(depositAmountWeth.mul(protocolFee).div(10000));
        }

        //console.log("CEther pool:");
        //console.log("--- Init");
        //await printBals(cEth, "cETH", [user, receiver, relayer, cethPool], ["User", "Receiver", "Relayer", "Pool"], 8);


        if (RUN_CETH) {
            // Time to do stuff with cEth
            let cethNotes = [];
            await cEth.connect(user).approve(cethPool.address, depositAmountCEth.mul(100));
            for (let i = 0; i < 4; i++) {
                let note = new Note(cEth.address, depositAmountCEth);
                note.setIndex(cethTree.totalElements);
                cethNotes.push(note);

                const { solidityProof, signals } = await generateDepositProof(note.commitment, cethTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);

                await cethPool.connect(user).deposit(solidityProof, signals);

                expect(await cethPool.getLastRoot()).to.equal(cethTree.root.toString());
                expect(await cEth.balanceOf(cethPool.address)).to.equal(depositAmountCEth.mul(i + 1));
                expect(await cethPool.leafCount()).to.equal(1 + i);
            }

            if (true) {
                let commits = [];
                for (let i = 0; i < 8; i++) {
                    let note = new Note(cEth.address, depositAmountCEth);
                    note.setIndex(cethTree.totalElements + i);
                    cethNotes.push(note);
                    commits.push(note.commitment);
                }

                const { solidityProof, signals } = await generateMultiDepositProof(commits, cethTree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
                await cethPool.connect(user).multiDeposit(solidityProof, signals);

                expect(await cethPool.getLastRoot()).to.equal(cethTree.root.toString());
                expect(await cEth.balanceOf(cethPool.address)).to.equal(depositAmountCEth.mul(12));
                expect(await cethPool.leafCount()).to.equal(12);
            }

            //console.log("--- After deposits");
            //await printBals(cEth, "cETH", [user, receiver, relayer, cethPool], ["User", "Receiver", "Relayer", "Pool"], 8);

            // Withdraw to receiver
            for (let i = 0; i < 1; i++) {
                let note = cethNotes[i];
                let fee = fromToken("0.01", 8);
                let proFee = depositAmountCEth.mul(protocolFee).div(10000);
                const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiver.address, fee, cethTree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

                let bal_receiver_ceth = await cEth.balanceOf(receiver.address);
                let bal_relayer_ceth = await cEth.balanceOf(relayer.address);

                await cethPool.connect(relayer).withdraw(withdrawProof, withdrawSignals);

                expect(await cEth.balanceOf(receiver.address)).to.equal(bal_receiver_ceth.add(depositAmountCEth.sub(fee.add(proFee))));
                expect(await cEth.balanceOf(relayer.address)).to.equal(bal_relayer_ceth.add(fee));
                expect(await cEth.balanceOf(cethPool.address)).to.equal(depositAmountCEth.mul(cethTree.totalElements).sub(depositAmountCEth.sub(proFee)));
            }

            //console.log("--- After withdraws");
            //await printBals(cEth, "cETH", [user, receiver, relayer, cethPool], ["User", "Receiver", "Relayer", "Pool"], 8);
            //console.log("Protocol fees for ceth: ", toToken(await cethPool.collectedFees(), 8));

            expect(await cEth.balanceOf(cethPool.address)).to.equal(depositAmountCEth.mul(11).add(depositAmountCEth.mul(protocolFee).div(10000)));
            await cethPool.connect(feeCollector).collectFees();
            expect(await cEth.balanceOf(cethPool.address)).to.equal(depositAmountCEth.mul(11));
            expect(await cEth.balanceOf(feeCollector.address)).to.equal(depositAmountCEth.mul(protocolFee).div(10000));

            //console.log("After collecting fees:");
            //await printBals(cEth, "cETH", [feeCollector, cethPool], ["Collector", "Pool"], 8);
            //await printBals(waweth, "WAWeth", [feeCollector, wawethPool], ["Collector", "Pool"], 18);
        }
    });


});

