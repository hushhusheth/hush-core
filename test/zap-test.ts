import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { zero_value, randomBN, toFixedHex } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { files } from "./../utils/zkfiles";

import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';
import { getNamedSigners, getUnnamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";

import { ADDRESSES } from "../utils/addresses";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);


describe("Zappers for aTokens", () => {

    let depth = 20;
    let depositAmount = fromToken("1", 18);

    let lendingPool: Contract;
    let weth: Contract;
    let wethERC20: Contract;
    let aWeth: Contract;
    let watokenFactory: Contract;
    let poolFactory: Contract;
    let zap: Contract;
    let waweth: Contract;
    let pool: Contract;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let relayer: SignerWithAddress;
    let receiver: SignerWithAddress;
    let feeCollector: SignerWithAddress;

    let tree: MerkleTree;

    beforeEach(async () => {

        lendingPool = await ethers.getContractAt("ILendingPool", ADDRESSES["lendingpool"]);
        weth = await ethers.getContractAt("IWETH", ADDRESSES["weth"]);
        wethERC20 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["weth"]);
        aWeth = await ethers.getContractAt("AToken", ADDRESSES["aweth"]);

        await deployments.run(["Setup", "AZap"]);

        let { deployer: _deployer } = await getNamedSigners(hre);
        deployer = _deployer;
        [user, receiver, relayer, feeCollector] = await getUnnamedSigners(hre);

        tree = new MerkleTree(depth, zero_value);
        tree.init();

        const hushFactoryAddress = (await deployments.get("PoolFactory")).address;
        poolFactory = await ethers.getContractAt("HushFactory", hushFactoryAddress);

        const watokenFactoryAddress = (await deployments.get("TokenFactory")).address;
        watokenFactory = await ethers.getContractAt("WATokenFactory", watokenFactoryAddress);

        const AZapAddress = (await deployments.get("AZap")).address;
        zap = await ethers.getContractAt("AZap", AZapAddress);

        let _depositAmount = depositAmount.mul(10);

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

        let wawethAddress = await watokenFactory.watokens(aWeth.address);
        waweth = await ethers.getContractAt("WAToken", wawethAddress);

        let poolAddress = await poolFactory.getERCPool(waweth.address, depositAmount);
        pool = await ethers.getContractAt("ERCHushPool", poolAddress);
    });

    it("azap deposit", async () => {
        let note = new Note(waweth.address, depositAmount);

        const { solidityProof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);

        await aWeth.connect(user).approve(zap.address, depositAmount.mul(2));
        await zap.connect(user).deposit(pool.address, solidityProof, signals);

        expect(await waweth.balanceOf(pool.address)).to.equal(depositAmount.mul(tree.totalElements));
        expect(await pool.leafCount()).to.equal(tree.totalElements);
    });

    it("azap multi deposit", async () => {
        let notes = [];
        let commits = [];
        for (let i = 0; i < 8; i++) {
            let note = new Note(waweth.address, depositAmount);
            notes.push(note);
            commits.push(note.commitment);
        }

        const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

        await aWeth.connect(user).approve(zap.address, depositAmount.mul(9));
        await zap.connect(user).multiDeposit(pool.address, solidityProof, signals);

        expect(await pool.getLastRoot()).to.equal(tree.root.toString());
        expect(await waweth.balanceOf(pool.address)).to.equal(depositAmount.mul(tree.totalElements));
        expect(await pool.leafCount()).to.equal(tree.totalElements);
    });


});