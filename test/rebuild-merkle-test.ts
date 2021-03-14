import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { Contract } from "ethers";

import { zero_value } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { files } from "../utils/zkfiles";
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';
import { getNamedSigners, getUnnamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";

import { buildTree } from "../utils/treebuilder";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

describe("Recreate tree from events", () => {

    // Settings
    let depth = 20;

    let poolFactory: Contract;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let relayer: SignerWithAddress;
    let receiver: SignerWithAddress;
    let feeCollector: SignerWithAddress;

    let depositAmount = fromToken("1000", 18);
    let mintAmount = depositAmount.mul(1000);

    let token: Contract;
    let pool: Contract;
    let poolTree: MerkleTree;


    beforeEach(async () => {
        await deployments.fixture(["Setup"]);

        const ERC20 = await ethers.getContractFactory("ERC20Tester");
        token = await ERC20.deploy(mintAmount);
        await token.deployed();

        const hushFactoryAddress = (await deployments.get("PoolFactory")).address;
        poolFactory = await ethers.getContractAt("HushFactory", hushFactoryAddress);

        await poolFactory.setFeeSize(0);
        await poolFactory.deployERCPool(token.address, depositAmount);

        let freshAddress = await poolFactory.getERCPool(token.address, depositAmount);
        const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
        pool = ERCHushPool.attach(freshAddress);

        let { deployer: _deployer } = await getNamedSigners(hre);
        deployer = _deployer;
        [user, receiver, relayer, feeCollector] = await getUnnamedSigners(hre);// ethers.getSigners();

        poolTree = new MerkleTree(depth, zero_value);
        poolTree.init();

        expect(await pool.getLastRoot()).to.equal(poolTree.root.toString());
        expect(await pool.leafCount()).to.equal(0);

    });

    it("4 single deposits + 1 multi-deposit, then recreate tree", async () => {

        let notes = [];
        await token.approve(pool.address, mintAmount);

        // Make 4 simple deposits
        for (let i = 0; i < 4; i++) {
            let note = new Note(token.address, depositAmount);
            note.setIndex(poolTree.totalElements);
            notes.push(note);

            const { solidityProof, signals } = await generateDepositProof(note.commitment, poolTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);

            await pool.deposit(solidityProof, signals);

            expect(await pool.getLastRoot()).to.equal(poolTree.root.toString());
            expect(await pool.leafCount()).to.equal(1 + i);
        }

        let commits = [];
        for (let i = 0; i < 8; i++) {
            let note = new Note(token.address, depositAmount);
            note.setIndex(poolTree.totalElements + i);
            notes.push(note);
            commits.push(note.commitment);
        }
        const { solidityProof, signals } = await generateMultiDepositProof(commits, poolTree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
        await pool.multiDeposit(solidityProof, signals);
        expect(await pool.getLastRoot()).to.equal(poolTree.root.toString());
        expect(await pool.leafCount()).to.equal(12);

        // Rebuild tree
        let rebuildTree = await buildTree(pool, depth);

        // Witdraw using the new tree
        let note = notes[7];
        let fee = fromToken("0.01", 18);
        const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiver.address, fee, rebuildTree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
        await pool.connect(relayer).withdraw(withdrawProof, withdrawSignals);

        expect(await token.balanceOf(relayer.address)).to.equal(fee);
        expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(fee));

        // Deposit with the new tree
        let freshNote = new Note(token.address, depositAmount);
        freshNote.setIndex(rebuildTree.totalElements);
        notes.push(freshNote);

        const { solidityProof: depositP, signals: depositS } = await generateDepositProof(freshNote.commitment, rebuildTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);

        await pool.deposit(depositP, depositS);

        expect(await pool.getLastRoot()).to.equal(rebuildTree.root.toString());
        expect(await pool.leafCount()).to.equal(rebuildTree.totalElements);


    });


});

