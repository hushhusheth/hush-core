import chalk from 'chalk';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { deployments, ethers } from "hardhat";
import { expect } from "chai";

import { MerkleTree } from "../zkproofs/src/merkletree";
import { zero_value } from "../zkproofs/src/utils";
import { BigNumber } from "@ethersproject/bignumber";
import { Note } from "../zkproofs/src/note";

import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";

import { files } from "./../utils/zkfiles";
import { ADDRESSES } from "../utils/addresses";
import { getNamedSigners, getUnnamedSigners } from 'hardhat-deploy-ethers/dist/src/helpers';
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';

import { buildTree } from "./../utils/treebuilder";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);
const formatAddress = (addr: string) => chalk.bold(chalk.green(addr));

type UserKnowledge = { depositCount: number, unspentDeposits: Note[], signer: SignerWithAddress };

async function printBals(token, tokenname, addresses, decimals) {
	console.log("Balances:");
	let sum = BigNumber.from(0);
	for (let i = 0; i < addresses.length; i++) {
		let bal: BigNumber = await token.balanceOf(addresses[i].address);
		console.log("\t", addresses[i].address, tokenname, "balance: ", toToken(bal.toString(), decimals));
		sum = sum.add(bal);
	}
	console.log("\t Sum: ", toToken(sum.toString(), decimals));
};

async function main() {
	// Settings:
	let depth = 20;
	let depositAmount = fromToken("1", 18);

	await deployments.run("Setup");
	//await deployments.all();

	let tree = new MerkleTree(depth, zero_value);
	tree.init();

	let [relayer, receiver, user1, user2, user3] = await getUnnamedSigners(hre);

	let users = [user1, user2, user3];
	let multiplier = 5;
	let numActions = 150;
	let wethDepositAmount = fromToken("1", 18).mul(numActions + multiplier).mul(8);

	let pUsers = [receiver, relayer];
	users.forEach(u => {
		pUsers.push(u);
	});

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

	let knowledgeBase: UserKnowledge[] = [];

	// We need a huge stack of WAWETH tokens
	for (let i = 0; i < users.length; i++) {
		let curr = users[i];

		knowledgeBase.push({
			depositCount: 0,
			unspentDeposits: [],
			signer: curr
		});

		// ETH -> WETH -> AWETH -> WAWETH
		await weth.connect(curr).deposit({ value: wethDepositAmount });
		await wethERC20.connect(curr).approve(lendingPool.address, wethDepositAmount);
		await lendingPool.connect(curr).deposit(weth.address, wethDepositAmount, curr.address, 0);
		await aWeth.connect(curr).approve(wawethAddress, wethDepositAmount);
		await waweth.connect(curr).deposit(wethDepositAmount);
		await waweth.connect(curr).approve(wawethPool.address, wethDepositAmount.mul(100));
	}
	// Time to print balances
	await printBals(waweth, "Wrapped aWeth", pUsers, 18);

	console.log("Initiate first deposits");

	// Deposit a bit before randomness
	for (let i = 0; i < users.length * multiplier; i++) {
		let userIndex = i % users.length;
		let curr = users[userIndex];

		let note = new Note(waweth.address, depositAmount);
		note.setIndex(tree.totalElements);
		const { solidityProof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
		await wawethPool.connect(curr).deposit(solidityProof, signals);

		expect(await wawethPool.getLastRoot()).to.equal(tree.root.toString());// signals[0]);
		expect(await wawethPool.leafCount()).to.equal(tree.totalElements);

		knowledgeBase[userIndex]["depositCount"]++;
		knowledgeBase[userIndex]["unspentDeposits"].push(note);
	}

	console.log("Initial deposits done");

	for (let i = 0; i < numActions; i++) {
		let userIndex = Math.floor(Math.random() * users.length);
		let curr = users[userIndex]

		let actionId = Math.floor(Math.random() * 8);

		if (actionId == 0) { // deposit 1
			console.log("Deposit");
			let note = new Note(waweth.address, depositAmount);
			note.setIndex(tree.totalElements);
			const { solidityProof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
			await wawethPool.connect(curr).deposit(solidityProof, signals);
			knowledgeBase[userIndex]["depositCount"]++;
			knowledgeBase[userIndex]["unspentDeposits"].push(note);
			let oldTreeRoot = tree.root.toString();
			try {
				expect(await wawethPool.getLastRoot()).to.equal(tree.root.toString());// signals[0]);
			} catch (err) {
				await printBals(waweth, "Wrapped aWeth", pUsers, 18);
				console.log("Current user: ", userIndex, curr);
				console.log("Pool count: ", (await wawethPool.leafCount()).toString());
				console.log("Tree count: ", tree.totalElements);
				console.log("Old tree root: ", oldTreeRoot);
				console.log(solidityProof, signals);
				console.log(err);
			}
		} else if (actionId == 1) { // deposit multi
			let zeros = Math.floor(Math.random() * 5);
			console.log("Multideposit", (8 - zeros));
			let notes = [];
			let commits = [];
			for (let i = 0; i < 8; i++) {
				if (i < 8 - zeros) {
					let note = new Note(waweth.address, depositAmount);
					note.setIndex(tree.totalElements + i);
					notes.push(note);
					commits.push(note.commitment);
					knowledgeBase[userIndex]["depositCount"]++;
					knowledgeBase[userIndex]["unspentDeposits"].push(note);
				} else {
					commits.push(zero_value);
				}
			}
			let oldTreeRoot = tree.root.toString();
			const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
			await wawethPool.connect(curr).multiDeposit(solidityProof, signals);
			try {
				expect(await wawethPool.getLastRoot()).to.equal(tree.root.toString());// signals[0]);
			} catch (err) {
				await printBals(waweth, "Wrapped aWeth", pUsers, 18);
				console.log("Current user: ", userIndex, curr);
				console.log("Pool count: ", (await wawethPool.leafCount()).toString());
				console.log("Tree count: ", tree.totalElements);
				console.log("Old tree root: ", oldTreeRoot);
				console.log(solidityProof, signals);
				console.log(err);
			}
		} else { // withdraw
			if (knowledgeBase[userIndex]["unspentDeposits"].length == 0) {
				continue;
			}
			let note = knowledgeBase[userIndex]["unspentDeposits"].shift();
			console.log(`Withdraw: ${note.toSave()}`);
			let fee = fromToken("0.001");
			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, await receiver.getAddress(), fee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
			await wawethPool.connect(relayer).withdraw(withdrawProof, withdrawSignals);
		}
	}

	// Rebuild the tree using the on-chain events, then withdraw from one of the users:
	console.log("Rebuilding tree with events, then withdraw");
	let rebuildTree = await buildTree(wawethPool, depth);

	// Witdraw using the new tree
	let note = null;
	let i = 0;
	while (note == null) {
		if (knowledgeBase[i]["unspentDeposits"].length == 0) {
			i++;
		} else {
			note = knowledgeBase[i]["unspentDeposits"].shift();
		}
	}

	let fee = fromToken("0.001");
	const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiver.address, fee, rebuildTree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
	await wawethPool.connect(relayer).withdraw(withdrawProof, withdrawSignals);
	console.log(`Withdraw: ${note.toSave()}`);

	// Deposit with the new tree
	let freshNote = new Note(waweth.address, depositAmount);
	freshNote.setIndex(tree.totalElements);

	const { solidityProof: depositP, signals: depositS } = await generateDepositProof(freshNote.commitment, rebuildTree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
	await wawethPool.connect(users[i]).deposit(depositP, depositS);
	console.log(`Deposit: ${freshNote.toSave()}`);

	expect(await wawethPool.getLastRoot()).to.equal(rebuildTree.root.toString());
	expect(await wawethPool.leafCount()).to.equal(rebuildTree.totalElements);


	// Time to print balances
	await printBals(waweth, "Wrapped aWeth", pUsers, 18);
	console.log("\tFees collected: ", toToken(await wawethPool.collectedFees()));
	console.log("\tPool size: ", toToken(await waweth.balanceOf(wawethPool.address)));
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});