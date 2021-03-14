const hre: HardhatRuntimeEnvironment = require("hardhat");

import { deployments, ethers } from "hardhat";
import { expect } from "chai";

import chalk from 'chalk';
import { MerkleTree } from "../zkproofs/src/merkletree";
import { zero_value, toFixedHex } from "../zkproofs/src/utils";
import { BigNumber } from "@ethersproject/bignumber";
import { Note } from "../zkproofs/src/note";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { Contract } from "@ethersproject/contracts";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { files } from "./../utils/zkfiles";
import { ADDRESSES } from "../utils/addresses";
import { getNamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";

import { buildTree } from "../utils/treebuilder";

const formatAddress = (addr: string) => chalk.bold(chalk.green(addr));
const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

async function getHushAndToken(depositAmount: BigNumber, depositer: SignerWithAddress, fund: boolean = true): Promise<{ hush: Contract, token: Contract }> {
    const lendingPool = await ethers.getContractAt("ILendingPool", ADDRESSES["lendingpool"]);
    const weth = await ethers.getContractAt("IWETH", ADDRESSES["weth"]);
    const wethERC20 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["weth"]);
    const aWeth = await ethers.getContractAt("AToken", ADDRESSES["aweth"]);

    const poolFactoryAddress = (await deployments.get("PoolFactory")).address;
    const watokenFactoryAddress = (await deployments.get("TokenFactory")).address;

    const poolFactory = await ethers.getContractAt("HushFactory", poolFactoryAddress);
    const watokenFactory = await ethers.getContractAt("WATokenFactory", watokenFactoryAddress);

    let wawethAddress = await watokenFactory.watokens(aWeth.address);
    console.log("Waweth address: ", wawethAddress);
    const waweth = await ethers.getContractAt("WAToken", wawethAddress);

    expect(await waweth.name()).to.equal("Wrapped aWeth");

    let wawethPoolAddress = await poolFactory.getERCPool(wawethAddress, depositAmount);
    console.log("Waweth Pool address: ", wawethPoolAddress);
    let wawethPool = await ethers.getContractAt("ERCHushPool", wawethPoolAddress);

    if (fund) {
        let _depositAmount = depositAmount.mul(10);
        await weth.connect(depositer).deposit({ value: _depositAmount });
        await wethERC20.connect(depositer).approve(lendingPool.address, _depositAmount);
        await lendingPool.connect(depositer).deposit(weth.address, _depositAmount, depositer.address, 0);
        await aWeth.connect(depositer).approve(waweth.address, _depositAmount);
        await waweth.connect(depositer).deposit(_depositAmount);
        //await token.connect(depositer).approve(hush.address, depositAmount.mul(100));
    }

    return new Promise((resolve, reject) => {
        resolve({
            hush: wawethPool,
            token: waweth,
        });
    });
}


async function main() {
    // Settings:
    let depth = 20;
    let gasPrice = ethers.utils.parseUnits("100", "gwei")
    let gasSpent = BigNumber.from(0);
    let depositAmount = fromToken("1", 18);
    let relayerFee = fromToken("0.001", 18);
    let protocolFee = depositAmount.div(10000).mul(50);

    let PRINT = true;

    //await deployments.run("Setup");

    const { deployer, proposer1: depositer, proposer2: relayer, proposer3: receiver } = await getNamedSigners(hre);

    let { hush, token } = await getHushAndToken(depositAmount, depositer);
    console.log("Preperation finished");

    // Generate tree
    let tree = await buildTree(hush, depth);

    let poolBalance: BigNumber = await token.balanceOf(hush.address);
    let relayerBalance: BigNumber = await token.balanceOf(await relayer.getAddress());
    let receiverBalance: BigNumber = await token.balanceOf(await receiver.getAddress());

    // Approve funds
    let { hash: approveHash } = await token.connect(depositer).approve(hush.address, depositAmount.mul(20));
    let { gasUsed: approveGas } = await deployer.provider.getTransactionReceipt(approveHash);
    gasSpent = gasSpent.add(approveGas);

    // The deposit
    let note = new Note(token.address, depositAmount);
    note.setIndex(tree.totalElements);
    const { solidityProof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
    let { hash: depositHash } = await hush.connect(depositer).deposit(solidityProof, signals);
    let { gasUsed: depositGas } = await deployer.provider.getTransactionReceipt(depositHash);
    gasSpent = gasSpent.add(depositGas);

    expect(await hush.getLastRoot()).to.equal(tree.root.toString(), "Roots not matching");
    expect(await hush.leafCount()).to.equal(tree.totalElements, "Number of deposits not matching");
    expect(await token.balanceOf(hush.address)).to.equal(poolBalance.add(depositAmount), "Pool balance not matching");

    if (PRINT) {
        console.log(chalk.bold("Deposit:"), note.toSave());
    }

    // Withdrawing
    const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, await receiver.getAddress(), relayerFee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
    let { hash: withdrawHash } = await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);
    let { gasUsed: withdrawGas } = await deployer.provider.getTransactionReceipt(withdrawHash);
    gasSpent = gasSpent.add(withdrawGas);
    if (PRINT) {
        console.log(chalk.bold("Spent:"), note.toSave());
    }

    expect(await token.balanceOf(hush.address)).to.equal(poolBalance.add(protocolFee), "Pool balance not matching");
    expect(await hush.leafCount()).to.equal(tree.totalElements, "Number of deposits not matching");
    expect(await token.balanceOf(await relayer.getAddress())).to.equal(relayerBalance.add(relayerFee), "Relayer balance not matching");
    expect(await token.balanceOf(await receiver.getAddress())).to.equal(receiverBalance.add(depositAmount.sub(relayerFee).sub(protocolFee)), "Receiver balance not matching");

    let ethSpent = ethers.utils.formatEther(gasSpent.mul(gasPrice));
    console.log(chalk.bold("Total gas spent: "), chalk.redBright(gasSpent.toString()), " => ", chalk.bold(chalk.redBright(ethSpent)), "eth");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });