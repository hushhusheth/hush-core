import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { zero_value, randomBN, toFixedHex } from "../zkproofs/src/utils";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { getNamedSigners, getUnnamedSigners } from 'hardhat-deploy-ethers/dist/src/helpers';
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';

let depth = 20;

const increaseTime = function (user, duration) {
    let provider = user.provider["_hardhatProvider"];
    const id = Date.now()

    return new Promise((resolve, reject) => {
        provider.sendAsync({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [duration],
            id: id,
        }, err1 => {
            if (err1) return reject(err1)

            provider.sendAsync({
                jsonrpc: '2.0',
                method: 'evm_mine',
                id: id + 1,
            }, (err2, res) => {
                return err2 ? reject(err2) : resolve(res)
            })
        })
    })
}

describe("Hush Controller", function () {
    let controller: Contract;
    let abiCoder = new ethers.utils.AbiCoder();

    let deployer: SignerWithAddress;
    let proposer: SignerWithAddress;
    let executor: SignerWithAddress;
    let newAdmin: SignerWithAddress;
    let newProposer: SignerWithAddress;
    let newExecutor: SignerWithAddress;

    beforeEach(async function () {
        const {
            deployer: _deployer,
        } = await getNamedSigners(hre);
        deployer = _deployer;

        [proposer, executor, newAdmin, newProposer, newExecutor] = await getUnnamedSigners(hre);


        const HushController = await ethers.getContractFactory("TimelockController");
        controller = await HushController.connect(deployer).deploy(0, [await proposer.getAddress()], [await executor.getAddress()]);
        await controller.deployed();
    });

    it("assigned roles", async function () {
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress())).to.equal(true);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await proposer.getAddress())).to.equal(true);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await executor.getAddress())).to.equal(true);
    });

    it("renounce roles", async function () {
        await expect(controller.connect(newProposer).renounceRole(await controller.PROPOSER_ROLE(), proposer.address)).to.be.revertedWith("AccessControl: can only renounce roles for self");

        // Renounce proposer
        await controller.connect(proposer).renounceRole(await controller.PROPOSER_ROLE(), await proposer.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await proposer.getAddress())).to.equal(false);

        // Renounce executor
        await controller.connect(executor).renounceRole(await controller.EXECUTOR_ROLE(), await executor.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await executor.getAddress())).to.equal(false);

        // Renounce admin
        await controller.renounceRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await deployer.getAddress())).to.equal(false);
    });

    it("admin revoke roles", async function () {
        await expect(controller.connect(newProposer).revokeRole(await controller.PROPOSER_ROLE(), proposer.address)).to.be.revertedWith("AccessControl: sender must be an admin to revoke");

        // revoke proposer
        await controller.connect(deployer).revokeRole(await controller.PROPOSER_ROLE(), await proposer.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await proposer.getAddress())).to.equal(false);

        // revoke executor
        await controller.connect(deployer).revokeRole(await controller.EXECUTOR_ROLE(), await executor.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await executor.getAddress())).to.equal(false);

        // revoke admin
        await controller.revokeRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress());
        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await deployer.getAddress())).to.equal(false);
    });

    it("revoke admin role, proposer + executor", async function () {
        // Create proposal
        let revokeAdminTX = await controller.populateTransaction.revokeRole(
            await controller.TIMELOCK_ADMIN_ROLE(),
            await deployer.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(revokeAdminTX.to, value, revokeAdminTX.data, predecessor, salt, 0);

        // Check that it is proposed correctly
        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [revokeAdminTX.to, value, revokeAdminTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        // Execute proposal
        await controller.connect(executor).execute(revokeAdminTX.to, value, revokeAdminTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await deployer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await deployer.getAddress())).to.equal(false);
    });

    it("revoke proposer role, proposer + executor", async function () {
        let revokeProposerTX = await controller.populateTransaction.revokeRole(
            await controller.PROPOSER_ROLE(),
            await proposer.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(revokeProposerTX.to, value, revokeProposerTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [revokeProposerTX.to, value, revokeProposerTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        await controller.connect(executor).execute(revokeProposerTX.to, value, revokeProposerTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await proposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await proposer.getAddress())).to.equal(false);
    });

    it("revoke executor role, proposer + executor", async function () {
        let revokeExecutorTX = await controller.populateTransaction.revokeRole(
            await controller.EXECUTOR_ROLE(),
            await executor.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(revokeExecutorTX.to, value, revokeExecutorTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [revokeExecutorTX.to, value, revokeExecutorTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        await controller.connect(executor).execute(revokeExecutorTX.to, value, revokeExecutorTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await executor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await executor.getAddress())).to.equal(false);
    });

    it("admin grants roles", async function () {
        let TIMELOCK_ADMIN_ROLE = await controller.TIMELOCK_ADMIN_ROLE();
        let PROPOSER_ROLE = await controller.PROPOSER_ROLE();
        let EXECUTOR_ROLE = await controller.EXECUTOR_ROLE();

        // grant proposer role
        await controller.connect(deployer).grantRole(PROPOSER_ROLE, newProposer.address);
        expect(await controller.hasRole(TIMELOCK_ADMIN_ROLE, newProposer.address)).to.equal(false);
        expect(await controller.hasRole(PROPOSER_ROLE, newProposer.address)).to.equal(true);
        expect(await controller.hasRole(EXECUTOR_ROLE, newProposer.address)).to.equal(false);

        // grant executor role
        await controller.connect(deployer).grantRole(EXECUTOR_ROLE, newExecutor.address);
        expect(await controller.hasRole(TIMELOCK_ADMIN_ROLE, newExecutor.address)).to.equal(false);
        expect(await controller.hasRole(PROPOSER_ROLE, newExecutor.address)).to.equal(false);
        expect(await controller.hasRole(EXECUTOR_ROLE, newExecutor.address)).to.equal(true);

        // grant admin role
        await controller.connect(deployer).grantRole(TIMELOCK_ADMIN_ROLE, newAdmin.address);
        expect(await controller.hasRole(TIMELOCK_ADMIN_ROLE, newAdmin.address)).to.equal(true);
        expect(await controller.hasRole(PROPOSER_ROLE, newAdmin.address)).to.equal(false);
        expect(await controller.hasRole(EXECUTOR_ROLE, newAdmin.address)).to.equal(false);
    });

    it("grant proposer role, proposer + executor", async function () {
        let grantProposerTX = await controller.populateTransaction.grantRole(
            await controller.PROPOSER_ROLE(),
            await newProposer.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(grantProposerTX.to, value, grantProposerTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantProposerTX.to, value, grantProposerTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newProposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newProposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newProposer.getAddress())).to.equal(false);

        await controller.connect(executor).execute(grantProposerTX.to, value, grantProposerTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newProposer.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newProposer.getAddress())).to.equal(true);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newProposer.getAddress())).to.equal(false);
    });

    it("grant executor role, proposer + executor", async function () {
        let grantExecutorTX = await controller.populateTransaction.grantRole(
            await controller.EXECUTOR_ROLE(),
            await newExecutor.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(false);

        await controller.connect(executor).execute(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(true);
    });

    it("grant executor role, proposer + executor", async function () {
        let grantExecutorTX = await controller.populateTransaction.grantRole(
            await controller.EXECUTOR_ROLE(),
            await newExecutor.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(false);

        await controller.connect(executor).execute(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newExecutor.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(true);
    });

    it("grant admin role, proposer + executor", async function () {
        let grantAdminTX = await controller.populateTransaction.grantRole(
            await controller.TIMELOCK_ADMIN_ROLE(),
            await newAdmin.getAddress()
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(grantAdminTX.to, value, grantAdminTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantAdminTX.to, value, grantAdminTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newAdmin.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newAdmin.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newAdmin.getAddress())).to.equal(false);

        await controller.connect(executor).execute(grantAdminTX.to, value, grantAdminTX.data, predecessor, salt);

        expect(await controller.hasRole(await controller.TIMELOCK_ADMIN_ROLE(), await newAdmin.getAddress())).to.equal(true);
        expect(await controller.hasRole(await controller.PROPOSER_ROLE(), await newAdmin.getAddress())).to.equal(false);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newAdmin.getAddress())).to.equal(false);
    });

    it("cancel pending propose", async () => {
        let updateDelayTX = await controller.populateTransaction.updateDelay(60);

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [updateDelayTX.to, value, updateDelayTX.data, predecessor, salt]
        ));

        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);

        await controller.connect(executor).execute(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt);
        expect(await controller.getMinDelay()).to.equal(60);

        updateDelayTX = await controller.populateTransaction.updateDelay(0);
        salt = toFixedHex(randomBN(31), 32);
        predecessor = toFixedHex(0, 32);
        value = 0;
        await controller.connect(proposer).schedule(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt, 60);

        operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [updateDelayTX.to, value, updateDelayTX.data, predecessor, salt]
        ));

        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(false);

        await controller.connect(proposer).cancel(operationHash);
        expect(await controller.isOperation(operationHash)).to.equal(false);
    });

    it("update delay", async function () {
        let updateDelayTX = await controller.populateTransaction.updateDelay(
            30
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [updateDelayTX.to, value, updateDelayTX.data, predecessor, salt]
        ));

        expect(await controller.getMinDelay()).to.equal(0);
        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        await controller.connect(executor).execute(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt);
        expect(await controller.getMinDelay()).to.equal(30);
    });

    it("propose with short delay", async function () {
        // Create update delay proposal
        let updateDelayTX = await controller.populateTransaction.updateDelay(30);

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [updateDelayTX.to, value, updateDelayTX.data, predecessor, salt]
        ));

        expect(await controller.getMinDelay()).to.equal(0);
        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        // Execute update proposal
        await controller.connect(executor).execute(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt);
        expect(await controller.getMinDelay()).to.equal(30);

        // Create proposal for granting executor role
        let grantExecutorTX = await controller.populateTransaction.grantRole(
            await controller.EXECUTOR_ROLE(),
            await newExecutor.getAddress()
        );

        salt = toFixedHex(randomBN(31), 32);
        predecessor = toFixedHex(0, 32);
        value = 0;

        // Publish proposal with smaller delay than minDelay 
        await expect(
            controller.connect(proposer).schedule(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt, 15)
        ).to.be.revertedWith("TimelockController: insufficient delay");

        operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(false);
    });

    it("execute function before delay", async function () {
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(false);

        // Proposal to update delay 
        let updateDelayTX = await controller.populateTransaction.updateDelay(
            30
        );

        let salt = toFixedHex(randomBN(31), 32);
        let predecessor = toFixedHex(0, 32);
        let value = 0;
        await controller.connect(proposer).schedule(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt, 0);

        let operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [updateDelayTX.to, value, updateDelayTX.data, predecessor, salt]
        ));

        expect(await controller.getMinDelay()).to.equal(0);
        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        // Execute update delay
        await controller.connect(executor).execute(updateDelayTX.to, value, updateDelayTX.data, predecessor, salt);
        expect(await controller.getMinDelay()).to.equal(30);

        // Proposal to grant executor role with 30% delay
        let grantExecutorTX = await controller.populateTransaction.grantRole(
            await controller.EXECUTOR_ROLE(),
            await newExecutor.getAddress()
        );

        salt = toFixedHex(randomBN(31), 32);
        predecessor = toFixedHex(0, 32);
        value = 0;

        await controller.connect(proposer).schedule(grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt, 30);

        // Checks
        operationHash = ethers.utils.keccak256(abiCoder.encode(
            ["address", "uint256", "bytes", "bytes32", "bytes32"],
            [grantExecutorTX.to, value, grantExecutorTX.data, predecessor, salt]
        ));

        expect(await controller.isOperation(operationHash)).to.equal(true);
        expect(await controller.isOperationPending(operationHash)).to.equal(true);
        expect(await controller.isOperationReady(operationHash)).to.equal(false);
        expect(await controller.isOperationDone(operationHash)).to.equal(false);

        // Increase time with 15s and execute the proposal (will revert)
        await increaseTime(deployer, 15);
        expect(await controller.isOperationReady(operationHash)).to.equal(false);

        await expect(
            controller.connect(executor).execute(
                grantExecutorTX.to,
                value,
                grantExecutorTX.data,
                predecessor,
                salt
            )).to.be.revertedWith("TimelockController: operation is not ready");

        // Increase time with 15s and execute the proposal
        await increaseTime(deployer, 15);
        expect(await controller.isOperationReady(operationHash)).to.equal(true);

        await controller.connect(executor).execute(
            grantExecutorTX.to,
            value,
            grantExecutorTX.data,
            predecessor,
            salt
        );

        expect(await controller.isOperationDone(operationHash)).to.equal(true);
        expect(await controller.hasRole(await controller.EXECUTOR_ROLE(), await newExecutor.getAddress())).to.equal(true);
    });

    describe("Controller with factory", function () {
        let token: Contract;
        let tree: MerkleTree;

        let depositVerifier: Contract;
        let multiDepositVerifier: Contract;
        let withdrawVerifier: Contract;

        let factory: Contract;
        //let controller: Contract;

        let mockVerifier: Contract;
        //let abiCoder = new ethers.utils.AbiCoder();

        beforeEach(async function () {
            //let [deployer, proposer, executor] = await ethers.getSigners();
            const DepositVerifier = await ethers.getContractFactory("zkproofs/build/sol/SingleDepositVerifier.sol:Verifier");
            depositVerifier = await DepositVerifier.deploy();
            await depositVerifier.deployed();

            const MultiDepositVerifier = await ethers.getContractFactory("zkproofs/build/sol/MultiDepositVerifier.sol:Verifier");
            multiDepositVerifier = await MultiDepositVerifier.deploy();
            await multiDepositVerifier.deployed();

            const WithdrawVerifier = await ethers.getContractFactory("zkproofs/build/sol/WithdrawVerifier.sol:Verifier");
            withdrawVerifier = await WithdrawVerifier.deploy();
            await withdrawVerifier.deployed();

            const MockVerifier = await ethers.getContractFactory("MockVerifier");
            mockVerifier = await MockVerifier.deploy();
            await mockVerifier.deployed();

            tree = new MerkleTree(depth, zero_value);
            tree.init();

            const ERC20 = await ethers.getContractFactory("ERC20Tester");
            token = await ERC20.deploy(100000);
            await token.deployed();

            const HushFactory = await ethers.getContractFactory("HushFactory");
            factory = await HushFactory.deploy(tree.root.toString(), depth);
            await factory.deployed();
            expect(await factory.owner()).to.equal(await deployer.getAddress());

            await factory.transferOwnership(controller.address);
            expect(await factory.owner()).to.equal(controller.address);
        });

        it("transfer factory ownership", async function () {
            let ownershipTX = await factory.populateTransaction.transferOwnership(
                await deployer.getAddress()
            );

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(ownershipTX.to, value, ownershipTX.data, predecessor, salt, 0);

            let operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [ownershipTX.to, value, ownershipTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(ownershipTX.to, value, ownershipTX.data, predecessor, salt);

            expect(await factory.owner()).to.equal(await deployer.getAddress());
        });

        it("renounce factory ownership", async function () {
            let ownershipTX = await factory.populateTransaction.renounceOwnership();

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(ownershipTX.to, value, ownershipTX.data, predecessor, salt, 0);

            let operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [ownershipTX.to, value, ownershipTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(ownershipTX.to, value, ownershipTX.data, predecessor, salt);

            expect(await factory.owner()).to.equal(toFixedHex(0, 20));
        });

        it("update verifier", async function () {
            let setVerifierTX = await factory.populateTransaction.setVerifiers(
                depositVerifier.address,
                multiDepositVerifier.address,
                withdrawVerifier.address
            );

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt, 0);

            let operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [setVerifierTX.to, value, setVerifierTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt);

            expect(await factory.depositVerifier()).to.equal(depositVerifier.address);
            expect(await factory.multiDepositVerifier()).to.equal(multiDepositVerifier.address);
            expect(await factory.withdrawVerifier()).to.equal(withdrawVerifier.address);
        });


        it("ossify factory", async function () {
            // Update the verifier
            let setVerifierTX = await factory.populateTransaction.setVerifiers(
                depositVerifier.address,
                multiDepositVerifier.address,
                withdrawVerifier.address
            );

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt, 0);

            let operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [setVerifierTX.to, value, setVerifierTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt);

            expect(await factory.depositVerifier()).to.equal(depositVerifier.address);
            expect(await factory.multiDepositVerifier()).to.equal(multiDepositVerifier.address);
            expect(await factory.withdrawVerifier()).to.equal(withdrawVerifier.address);

            // Ossify the verifiers
            let ownershipTX = await factory.populateTransaction.ossify();

            salt = toFixedHex(randomBN(31), 32);
            predecessor = toFixedHex(0, 32);
            value = 0;
            await controller.connect(proposer).schedule(ownershipTX.to, value, ownershipTX.data, predecessor, salt, 0);

            operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [ownershipTX.to, value, ownershipTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(ownershipTX.to, value, ownershipTX.data, predecessor, salt);

            expect(await factory.ossified()).to.equal(true);
        });

        it("create genesis:", async function () {
            // Update the verifier
            let setVerifierTX = await factory.populateTransaction.setVerifiers(
                depositVerifier.address,
                multiDepositVerifier.address,
                withdrawVerifier.address
            );

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt, 0);

            let operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [setVerifierTX.to, value, setVerifierTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt);

            expect(await factory.depositVerifier()).to.equal(depositVerifier.address);
            expect(await factory.multiDepositVerifier()).to.equal(multiDepositVerifier.address);
            expect(await factory.withdrawVerifier()).to.equal(withdrawVerifier.address);

            // Create the genesis
            let genesisTX = await factory.populateTransaction.genesis(
                token.address,
                1000
            );

            salt = toFixedHex(randomBN(31), 32);
            predecessor = toFixedHex(0, 32);
            value = 0;
            await controller.connect(proposer).schedule(genesisTX.to, value, genesisTX.data, predecessor, salt, 0);

            operationHash = ethers.utils.keccak256(abiCoder.encode(
                ["address", "uint256", "bytes", "bytes32", "bytes32"],
                [genesisTX.to, value, genesisTX.data, predecessor, salt]
            ));

            expect(await controller.isOperation(operationHash)).to.equal(true);
            expect(await controller.isOperationPending(operationHash)).to.equal(true);
            expect(await controller.isOperationReady(operationHash)).to.equal(true);
            expect(await controller.isOperationDone(operationHash)).to.equal(false);

            await controller.connect(executor).execute(genesisTX.to, value, genesisTX.data, predecessor, salt);

            let freshPoolAddress = await await factory.getERCPool(token.address, 1000);
            expect(freshPoolAddress).to.not.equal(toFixedHex(0, 20));

            const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
            let hush = ERCHushPool.attach(freshPoolAddress);
            await hush.deployed();

            expect(await hush.depositAmount()).to.equal(1000);
            expect(await hush.token()).to.equal(token.address);
        });

        it("create second pool", async function () {
            // Update the verifier
            let setVerifierTX = await factory.populateTransaction.setVerifiers(
                depositVerifier.address,
                multiDepositVerifier.address,
                withdrawVerifier.address
            );

            let salt = toFixedHex(randomBN(31), 32);
            let predecessor = toFixedHex(0, 32);
            let value = 0;
            await controller.connect(proposer).schedule(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt, 0);
            await controller.connect(executor).execute(setVerifierTX.to, value, setVerifierTX.data, predecessor, salt);

            // Create and execute genesis proposal
            let genesisTX = await factory.populateTransaction.genesis(
                token.address,
                1000
            );

            salt = toFixedHex(randomBN(31), 32);
            predecessor = toFixedHex(0, 32);
            value = 0;
            await controller.connect(proposer).schedule(genesisTX.to, value, genesisTX.data, predecessor, salt, 0);
            await controller.connect(executor).execute(genesisTX.to, value, genesisTX.data, predecessor, salt);

            // Create and execute next pool
            let nextPoolTX = await factory.populateTransaction.deployERCPool(
                token.address,
                10000
            );

            salt = toFixedHex(randomBN(31), 32);
            predecessor = toFixedHex(0, 32);
            value = 0;
            await controller.connect(proposer).schedule(nextPoolTX.to, value, nextPoolTX.data, predecessor, salt, 0);
            await controller.connect(executor).execute(nextPoolTX.to, value, nextPoolTX.data, predecessor, salt);

            // Checks
            let pool = await await factory.getERCPool(token.address, 10000);
            const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
            let hush = ERCHushPool.attach(pool);
            await hush.deployed();

            expect(await hush.token()).to.equal(token.address);
            expect(await hush.depositAmount()).to.equal(10000);
        });

    });
});