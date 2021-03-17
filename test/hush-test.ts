import { HardhatRuntimeEnvironment } from "hardhat/types";
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { zero_value, randomBN, toFixedHex, toBN } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";

let depth = 20;

import { getNamedSigners, getUnnamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";

import { files } from "../utils/zkfiles";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

const increaseTime = function (user, duration) {
	let provider = user.provider["_hardhatProvider"];
	const id = Date.now();

	return new Promise((resolve, reject) => {
		provider.sendAsync(
			{
				jsonrpc: "2.0",
				method: "evm_increaseTime",
				params: [duration],
				id: id,
			},
			(err1) => {
				if (err1) return reject(err1);

				provider.sendAsync(
					{
						jsonrpc: "2.0",
						method: "evm_mine",
						id: id + 1,
					},
					(err2, res) => {
						return err2 ? reject(err2) : resolve(res);
					}
				);
			}
		);
	});
};

describe("Hush Hush anonymity pools with fresh ERC20", () => {
	let token: Contract;
	let factory: Contract;
	let hush: Contract;
	let tree: MerkleTree;

	let depositAmount = fromToken("1000", 18);
	let mintAmount = depositAmount.mul(1000);

	let deployer: SignerWithAddress;
	let user: SignerWithAddress;
	let user2: SignerWithAddress;
	let relayer: SignerWithAddress;
	let receiver: SignerWithAddress;
	let collector: SignerWithAddress;

	beforeEach(async () => {
		await deployments.fixture("Setup");

		let { deployer: _deployer } = await getNamedSigners(hre);
		deployer = _deployer;
		[user, user2, relayer, receiver, collector] = await getUnnamedSigners(hre);

		tree = new MerkleTree(depth, zero_value);
		tree.init();

		const ERC20 = await ethers.getContractFactory("ERC20Tester");
		token = await ERC20.deploy(mintAmount);
		await token.deployed();

		// Fund user and user2
		await token.transfer(user.address, depositAmount.mul(100));
		await token.transfer(user2.address, depositAmount.mul(100));

		const hushFactoryAddress = (await deployments.get("PoolFactory")).address;
		factory = await ethers.getContractAt("HushFactory", hushFactoryAddress);

		await factory.setFeeSize(0);
		expect(await factory.feeSize()).to.equal(0);

		await factory.deployERCPool(token.address, depositAmount);

		let freshAddress = await factory.getERCPool(token.address, depositAmount);

		//const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
		hush = await ethers.getContractAt("ERCHushPool", freshAddress);
		//hush = ERCHushPool.attach(freshAddress);

		expect(await hush.getLastRoot()).to.equal(tree.root.toString());
		expect(await hush.leafCount()).to.equal(0);
	});
/*
	describe("Factory", () => {
		it("check init", async () => {
			expect(await factory.owner()).to.equal(deployer.address);
			expect(await factory.feeSize()).to.equal(0);
			expect(await factory.feeCollector()).to.equal(toFixedHex(0, 20));
			expect(await factory.ossified()).to.equal(false);
		});

		it("ownership", async () => {
			await factory.transferOwnership(user.address);
			await expect(factory.transferOwnership(user.address)).to.be.revertedWith("Ownable: caller is not the owner");
			expect(await factory.owner()).to.equal(user.address);

			await expect(factory.renounceOwnership()).to.be.revertedWith("Ownable: caller is not the owner");
			await factory.connect(user).renounceOwnership();
			expect(await factory.owner()).to.equal(toFixedHex(0, 20));
		});

		it("update fee size", async () => {
			await factory.setFeeSize(49);
			expect(await factory.feeSize()).to.equal(49);

			await expect(factory.setFeeSize(200)).to.be.revertedWith("Factory: fee is above 100 basis points");
			await expect(factory.connect(user).setFeeSize(48)).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("update fee collector", async () => {
			await factory.setFeeCollector(user2.address);
			expect(await factory.feeCollector()).to.equal(user2.address);

			await expect(factory.connect(user).setFeeCollector(user2.address)).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("update verifier:", async () => {
			// Queue update of verifiers
			await factory.queueVerifierUpdate(factory.address, factory.address, factory.address);

			expect(await factory.proposedDepositVerifier()).to.equal(factory.address);
			expect(await factory.proposedMultiDepositVerifier()).to.equal(factory.address);
			expect(await factory.proposedWithdrawVerifier()).to.equal(factory.address);

			// Update the verifiers

			await expect(factory.setVerifiers(factory.address, factory.address, factory.address)).to.be.revertedWith(
				"Factory: verifiers not matching criterias"
			);

			// Update verifier before delay
			await increaseTime(deployer, 60 * 60 * 24 * 3);
			await expect(factory.setVerifiers(factory.address, factory.address, factory.address)).to.be.revertedWith(
				"Factory: verifiers not matching criterias"
			);

			// Update verifiers after delay, before grace ends
			await increaseTime(deployer, 60 * 60 * 24 * 4 + 600);
			await factory.setVerifiers(factory.address, factory.address, factory.address);
			expect(await factory.depositVerifier()).to.equal(factory.address);
			expect(await factory.multiDepositVerifier()).to.equal(factory.address);
			expect(await factory.withdrawVerifier()).to.equal(factory.address);
		});

		it("update verifier, after grace period:", async () => {
			// Queue update of verifiers
			await factory.queueVerifierUpdate(factory.address, factory.address, factory.address);

			expect(await factory.proposedDepositVerifier()).to.equal(factory.address);
			expect(await factory.proposedMultiDepositVerifier()).to.equal(factory.address);
			expect(await factory.proposedWithdrawVerifier()).to.equal(factory.address);

			// Update the verifiers before delay
			await expect(factory.setVerifiers(factory.address, factory.address, factory.address)).to.be.revertedWith(
				"Factory: verifiers not matching criterias"
			);

			await increaseTime(deployer, 60 * 60 * 24 * 8);
			// Update the verifiers after delay + grace
			await expect(factory.setVerifiers(factory.address, factory.address, factory.address)).to.be.revertedWith(
				"Factory: verifiers not matching criterias"
			);
		});


		it("ossify", async () => {
			let zero_address = toFixedHex(0, 20);

			await expect(factory.connect(user).ossify()).to.be.revertedWith("Ownable: caller is not the owner");

			await factory.ossify();
			expect(await factory.ossified()).to.equal(true);

			await expect(factory.ossify()).to.be.revertedWith("Factory: already ossified");

			await expect(factory.setVerifiers(zero_address, zero_address, zero_address)).to.be.revertedWith("Factory: verifiers ossified");
		});

		it("genesis", async () => {
			await expect(factory.genesis(token.address, depositAmount.mul(2))).to.be.revertedWith("Factory: genesis already defined");

			const HushFactory = await ethers.getContractFactory("HushFactory");
			factory = await HushFactory.deploy(tree.root.toString(), tree.depth);
			await factory.deployed();

			await expect(factory.genesis(token.address, depositAmount)).to.be.revertedWith("Factory: undefined deposit verifier");
			await factory.setVerifiers(toFixedHex(1, 20), toFixedHex(1, 20), toFixedHex(1, 20));

			await expect(factory.deployERCPool(token.address, depositAmount)).to.be.revertedWith("Factory: genesis not defined");
			await factory.genesis(token.address, depositAmount);
			expect(await factory.getERCPool(token.address, depositAmount)).to.not.equal(toFixedHex(0, 20));
		});

		it("deploy additional pools", async () => {
			await expect(factory.connect(user).deployERCPool(token.address, depositAmount.div(10))).to.be.revertedWith("Ownable: caller is not the owner");

			let amounts = [depositAmount.div(10), depositAmount.mul(10), depositAmount.mul(100)];
			for (let i = 0; i < amounts.length; i++) {
				await factory.deployERCPool(token.address, amounts[i]);
				expect(await factory.getERCPool(token.address, amounts[i])).to.not.equal(toFixedHex(0, 20));

				await expect(factory.deployERCPool(token.address, amounts[i])).to.be.revertedWith("Factory: pool already exists");
			}
		});

		it("retire pool", async () => {
			let oldAddr = await factory.getERCPool(token.address, depositAmount);

			await factory.retirePool(token.address, depositAmount);

			await factory.deployERCPool(token.address, depositAmount);
			expect(await factory.getERCPool(token.address, depositAmount)).to.not.equal(oldAddr);

			await factory.deployERCPool(token.address, depositAmount.mul(10));
			expect(await factory.getERCPool(token.address, depositAmount.mul(10))).to.not.equal(toFixedHex(0, 20));
		});
	});

	describe("Deposits", () => {
		it("single deposit", async () => {
			let note = new Note(token.address, depositAmount);

			const { solidityProof, signals } = await generateDepositProof(
				note.commitment,
				tree,
				files["SingleDeposit"]["wasm"],
				files["SingleDeposit"]["zkey"]
			);

			await token.connect(user).approve(hush.address, depositAmount);
			await hush.connect(user).deposit(solidityProof, signals);

			expect(await hush.getLastRoot()).to.equal(signals[0]);
			expect(await hush.leafCount()).to.equal(1);
			expect(await token.balanceOf(hush.address)).to.equal(depositAmount);
		});

		it("multi deposit, 8 deposits", async () => {
			let deposits = [true, true, true, true, true, true, true, true];
			let commits = deposits.map((b) => {
				return b ? new Note(token.address, depositAmount).commitment : zero_value;
			});

			const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

			await token.connect(user).approve(hush.address, depositAmount.mul(8));
			await hush.connect(user).multiDeposit(solidityProof, signals);

			expect(await hush.getLastRoot()).to.equal(signals[0]);
			expect(await hush.leafCount()).to.equal(8);
			expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(8));
		});

		it("multi deposit, 7 deposits, zeros appended to pad to 8", async () => {
			let deposits = [true, true, true, true, true, true, true, false];
			let commits = deposits.map((b) => {
				return b ? new Note(token.address, depositAmount).commitment : zero_value;
			});

			const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

			await token.connect(user).approve(hush.address, depositAmount.mul(7));
			await hush.connect(user).multiDeposit(solidityProof, signals);

			expect(await hush.getLastRoot()).to.equal(signals[0]);
			expect(await hush.leafCount()).to.equal(7);
			expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(7));
		});

		describe("invalid deposits - fails", () => {
			it("single deposit, too few approved tokens", async () => {
				let note = new Note(token.address, depositAmount);

				let root = tree.root;

				const { solidityProof, signals } = await generateDepositProof(
					note.commitment,
					tree,
					files["SingleDeposit"]["wasm"],
					files["SingleDeposit"]["zkey"]
				);

				await expect(hush.connect(user).deposit(solidityProof, signals)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

				await token.connect(user).approve(hush.address, depositAmount.sub(1));

				await expect(hush.connect(user).deposit(solidityProof, signals)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

				expect(await hush.getLastRoot()).to.equal(root.toString());
				expect(await hush.leafCount()).to.equal(0);
				expect(await token.balanceOf(hush.address)).to.equal(0);
			});

			it("single deposit, replay", async () => {
				let note = new Note(token.address, depositAmount);

				const { solidityProof, signals } = await generateDepositProof(
					note.commitment,
					tree,
					files["SingleDeposit"]["wasm"],
					files["SingleDeposit"]["zkey"]
				);

				await token.connect(user).approve(hush.address, depositAmount.mul(2));
				await hush.connect(user).deposit(solidityProof, signals);

				await expect(hush.connect(user).deposit(solidityProof, signals)).to.be.revertedWith("HushPool: oldroot not matching");

				expect(await hush.getLastRoot()).to.equal(signals[0]);
				expect(await hush.leafCount()).to.equal(1);
				expect(await token.balanceOf(hush.address)).to.equal(depositAmount);
			});

			it("single deposit, invalid inputs and proof", async () => {
				let root = tree.root;
				let note = new Note(token.address, depositAmount);
				const { solidityProof, signals } = await generateDepositProof(
					note.commitment,
					tree,
					files["SingleDeposit"]["wasm"],
					files["SingleDeposit"]["zkey"]
				);

				const getTemp = (sigs) => {
					let tempSigs = [];
					sigs.forEach((element) => {
						tempSigs.push(element);
					});
					return tempSigs;
				};

				let sigs = getTemp(signals);

				// Swap root for invalid root
				sigs[1] = signals[0];
				await expect(hush.connect(user).deposit(solidityProof, sigs)).to.be.revertedWith("HushPool: oldroot not matching");
				sigs[1] = signals[1];

				// Swap index
				sigs[2] = 500;
				await expect(hush.connect(user).deposit(solidityProof, sigs)).to.be.revertedWith("HushPool: index not matching");
				sigs[2] = signals[2];

				// full tree. hmmm test with small thing i guess

				let proof = getTemp(solidityProof);
				let field = toBN("21888242871839275222246405745257275088548364400416034343698204186575808495617").toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = field;
					await expect(hush.connect(user).deposit(proof, signals)).to.be.revertedWith("HushPool: proof contains invalid elements");

					proof[i] = solidityProof[i];
				}

				let randomElement = randomBN(20).toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = randomElement;
					await expect(hush.connect(user).deposit(proof, signals)).to.be.revertedWith("");
					proof[i] = solidityProof[i];
				}
				for (let i = 0; i < signals.length; i++) {
					sigs[i] = randomElement;
					await expect(hush.connect(user).deposit(solidityProof, sigs)).to.be.revertedWith("");
					sigs[i] = signals[i];
				}

				expect(await hush.getLastRoot()).to.equal(root.toString());
				expect(await hush.leafCount()).to.equal(0);
				expect(await token.balanceOf(hush.address)).to.equal(0);
			});

			it("multi deposit, 7 deposits zero not last", async () => {
				for (let i = 0; i < 7; i++) {
					tree = new MerkleTree(depth, zero_value);
					tree.init();
					let deposits = [true, true, true, true, true, true, true, true];
					deposits[i] = false;
					let commits = deposits.map((b) => {
						return b ? new Note(token.address, depositAmount).commitment : zero_value;
					});
					const { solidityProof, signals } = await generateMultiDepositProof(
						commits,
						tree,
						files["MultiDeposit"]["wasm"],
						files["MultiDeposit"]["zkey"],
						true
					);

					await expect(hush.connect(user).multiDeposit(solidityProof, signals)).to.be.revertedWith("HushPool: non-zero after zeroleaf");
				}
			});

			it("multi deposit, invalid inputs and proof", async () => {
				let root = tree.root;
				let deposits = [true, true, true, true, true, true, true, true];
				let commits = deposits.map((b) => {
					return b ? new Note(token.address, depositAmount).commitment : zero_value;
				});
				const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

				const getTemp = (sigs) => {
					let tempSigs = [];
					sigs.forEach((element) => {
						tempSigs.push(element);
					});
					return tempSigs;
				};

				let sigs = getTemp(signals);

				// Swap root for invalid root
				sigs[1] = signals[0];
				await expect(hush.connect(user).multiDeposit(solidityProof, sigs)).to.be.revertedWith("HushPool: oldroot not matching");
				sigs[1] = signals[1];

				// Swap index
				sigs[2] = 500;
				await expect(hush.connect(user).multiDeposit(solidityProof, sigs)).to.be.revertedWith("HushPool: index not matching");
				sigs[2] = signals[2];

				// full tree. hmmm test with small thing i guess

				let proof = getTemp(solidityProof);
				let field = toBN("21888242871839275222246405745257275088548364400416034343698204186575808495617").toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = field;
					await expect(hush.connect(user).multiDeposit(proof, signals)).to.be.revertedWith("HushPool: proof contains invalid elements");

					proof[i] = solidityProof[i];
				}

				let randomElement = randomBN(20).toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = randomElement;
					await expect(hush.connect(user).multiDeposit(proof, signals)).to.be.revertedWith("");
					proof[i] = solidityProof[i];
				}

				for (let i = 0; i < signals.length; i++) {
					sigs[i] = randomElement;
					await expect(hush.connect(user).multiDeposit(solidityProof, sigs)).to.be.revertedWith("");
					sigs[i] = signals[i];
				}

				expect(await hush.getLastRoot()).to.equal(root.toString());
				expect(await hush.leafCount()).to.equal(0);
				expect(await token.balanceOf(hush.address)).to.equal(0);
			});
		});
	});

	describe("Withdraws", () => {
		let notes: Note[];

		beforeEach(async () => {
			notes = [];
			// Individual deposits
			let individualDeposits = 1;

			for (let i = 0; i < individualDeposits; i++) {
				let note = new Note(token.address, depositAmount);
				note.setIndex(tree.totalElements);
				notes.push(note);

				const { solidityProof, signals } = await generateDepositProof(
					note.commitment,
					tree,
					files["SingleDeposit"]["wasm"],
					files["SingleDeposit"]["zkey"]
				);

				await token.connect(user).approve(hush.address, depositAmount);
				await hush.connect(user).deposit(solidityProof, signals);
			}

			let multiDeposits = 1;

			for (let i = 0; i < multiDeposits; i++) {
				let commits = [];
				for (let j = 0; j < 8; j++) {
					let note = new Note(token.address, depositAmount);
					note.setIndex(tree.totalElements + j);
					notes.push(note);
					commits.push(note.commitment);
				}

				const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

				await token.connect(user2).approve(hush.address, depositAmount.mul(8));
				await hush.connect(user2).multiDeposit(solidityProof, signals);
			}

			expect(await hush.getLastRoot()).to.equal(tree.root.toString());
			expect(await hush.leafCount()).to.equal(tree.totalElements);
			expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(tree.totalElements));
		});

		it("withdraw from single", async () => {
			let index = 0;
			let note = notes[index];
			let relayerFee = depositAmount.div(100);

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			let poolBalancePre = await token.balanceOf(hush.address);

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

			let poolBalancePost = await token.balanceOf(hush.address);

			expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount));
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee));
			expect(await token.balanceOf(relayer.address)).to.equal(relayerFee);
		});

		it("withdraw from multi", async () => {
			let index = 7;
			let note = notes[index];
			let relayerFee = depositAmount.div(100);

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			let poolBalancePre = await token.balanceOf(hush.address);

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

			let poolBalancePost = await token.balanceOf(hush.address);

			expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount));
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee));
			expect(await token.balanceOf(relayer.address)).to.equal(relayerFee);
		});

		it("withdraw all", async () => {
			for (let i = 0; i < notes.length; i++) {
				let index = i;
				let note = notes[index];
				let relayerFee = depositAmount.div(100);

				const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
					note,
					await receiver.getAddress(),
					relayerFee,
					tree,
					files["Withdraw"]["wasm"],
					files["Withdraw"]["zkey"]
				);

				let poolBalancePre = await token.balanceOf(hush.address);

				await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

				let poolBalancePost = await token.balanceOf(hush.address);

				expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount));
				expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).mul(i + 1));
				expect(await token.balanceOf(relayer.address)).to.equal(relayerFee.mul(i + 1));
			}
		});

		describe("invalid withdraws - fails", () => {
			it("withdraw, fee larger than depositamount", async () => {
				let index = 0;
				let note = notes[index];
				let relayerFee = depositAmount.add(100);

				const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
					note,
					await receiver.getAddress(),
					relayerFee,
					tree,
					files["Withdraw"]["wasm"],
					files["Withdraw"]["zkey"]
				);

				await expect(hush.connect(relayer).withdraw(withdrawProof, withdrawSignals)).to.be.revertedWith("SafeMath: subtraction overflow");
			});

			it("withdraw doublespend", async () => {
				let index = 0;
				let note = notes[index];
				let relayerFee = depositAmount.div(100);

				const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
					note,
					await receiver.getAddress(),
					relayerFee,
					tree,
					files["Withdraw"]["wasm"],
					files["Withdraw"]["zkey"]
				);

				await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);
				let poolBalance = await token.balanceOf(hush.address);

				await expect(hush.connect(relayer).withdraw(withdrawProof, withdrawSignals)).to.be.revertedWith("HushPool: nullifier reuse");

				expect(await token.balanceOf(hush.address)).to.equal(poolBalance);
			});

			it("withdraw, invalid inputs and proof", async () => {
				let root = tree.root;
				let poolBalance = await token.balanceOf(hush.address);

				let index = 1;
				let note = notes[index];
				let relayerFee = depositAmount.div(100);

				const { solidityProof, signals } = await generateWithdrawProof(
					note,
					await receiver.getAddress(),
					relayerFee,
					tree,
					files["Withdraw"]["wasm"],
					files["Withdraw"]["zkey"]
				);

				const getTemp = (sigs) => {
					let tempSigs = [];
					sigs.forEach((element) => {
						tempSigs.push(element);
					});
					return tempSigs;
				};

				let sigs = getTemp(signals);

				// Swap root for unknown root
				sigs[1] = signals[0];
				await expect(hush.connect(user).withdraw(solidityProof, sigs)).to.be.revertedWith("HushPool: root not known");
				sigs[1] = signals[1];

				// Nullifier reuse is with doublespend in its own test

				let proof = getTemp(solidityProof);
				let field = toBN("21888242871839275222246405745257275088548364400416034343698204186575808495617").toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = field;
					await expect(hush.connect(user).withdraw(proof, signals)).to.be.revertedWith("HushPool: proof contains invalid elements");

					proof[i] = solidityProof[i];
				}

				let randomElement = randomBN(20).toString();
				for (let i = 0; i < 8; i++) {
					proof[i] = randomElement;
					await expect(hush.connect(user).withdraw(proof, signals)).to.be.revertedWith("");
					proof[i] = solidityProof[i];
				}
				for (let i = 0; i < signals.length; i++) {
					sigs[i] = randomElement;
					await expect(hush.connect(user).withdraw(solidityProof, sigs)).to.be.revertedWith("");
					sigs[i] = signals[i];
				}

				expect(await hush.getLastRoot()).to.equal(root.toString());
				expect(await hush.leafCount()).to.equal(tree.totalElements);
				expect(await token.balanceOf(hush.address)).to.equal(poolBalance);
			});
		});
	});

	describe("With protocol fees", () => {
		let notes: Note[];
		let feeBasisPoints = 50;

		beforeEach(async () => {
			await factory.setFeeSize(feeBasisPoints);
			expect(await factory.feeSize()).to.equal(feeBasisPoints);

			notes = [];
			// Individual deposits
			let individualDeposits = 1;

			for (let i = 0; i < individualDeposits; i++) {
				let note = new Note(token.address, depositAmount);
				note.setIndex(tree.totalElements);
				notes.push(note);

				const { solidityProof, signals } = await generateDepositProof(
					note.commitment,
					tree,
					files["SingleDeposit"]["wasm"],
					files["SingleDeposit"]["zkey"]
				);

				await token.connect(user).approve(hush.address, depositAmount);
				await hush.connect(user).deposit(solidityProof, signals);
			}

			let multiDeposits = 1;

			for (let i = 0; i < multiDeposits; i++) {
				let commits = [];
				for (let j = 0; j < 8; j++) {
					let note = new Note(token.address, depositAmount);
					note.setIndex(tree.totalElements + j);
					notes.push(note);
					commits.push(note.commitment);
				}

				const { solidityProof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);

				await token.connect(user2).approve(hush.address, depositAmount.mul(8));
				await hush.connect(user2).multiDeposit(solidityProof, signals);
			}

			expect(await hush.getLastRoot()).to.equal(tree.root.toString());
			expect(await hush.leafCount()).to.equal(tree.totalElements);
			expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(tree.totalElements));
		});

		it("withdraw from single", async () => {
			let index = 0;
			let note = notes[index];
			let relayerFee = depositAmount.div(100);
			let expectedFee = depositAmount.div(10000).mul(feeBasisPoints);

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			let poolBalancePre = await token.balanceOf(hush.address);

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

			let poolBalancePost = await token.balanceOf(hush.address);

			expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount.sub(expectedFee)));
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).sub(expectedFee));
			expect(await token.balanceOf(relayer.address)).to.equal(relayerFee);
		});

		it("withdraw, fee larger than depositamount", async () => {
			let index = 0;
			let note = notes[index];
			let expectedFee = depositAmount.div(10000).mul(feeBasisPoints);
			let relayerFee = depositAmount.sub(expectedFee).add(5);

			expect(relayerFee.add(expectedFee).gt(depositAmount)).to.equal(true, "relayerFee+protocolfee <= depositamount");

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			await expect(hush.connect(relayer).withdraw(withdrawProof, withdrawSignals)).to.be.revertedWith("SafeMath: subtraction overflow");
		});

		it("withdraw from multi", async () => {
			let index = 7;
			let note = notes[index];
			let relayerFee = depositAmount.div(100);
			let expectedFee = depositAmount.div(10000).mul(feeBasisPoints);

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			let poolBalancePre = await token.balanceOf(hush.address);

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

			let poolBalancePost = await token.balanceOf(hush.address);

			expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount.sub(expectedFee)));
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).sub(expectedFee));
			expect(await token.balanceOf(relayer.address)).to.equal(relayerFee);
		});

		it("claim fees", async () => {
			let index = 0;
			let note = notes[index];
			let relayerFee = depositAmount.div(100);
			let expectedFee = depositAmount.div(10000).mul(feeBasisPoints);

			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);

			let poolBalancePre = await token.balanceOf(hush.address);

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSignals);

			let poolBalancePost = await token.balanceOf(hush.address);

			expect(poolBalancePre).to.equal(poolBalancePost.add(depositAmount.sub(expectedFee)));
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).sub(expectedFee));
			expect(await token.balanceOf(relayer.address)).to.equal(relayerFee);

			await factory.setFeeCollector(collector.address);
			expect(await token.balanceOf(collector.address)).to.equal(0);

			// non-collector claims
			await expect(hush.connect(user).collectFees()).to.be.revertedWith("ERCHushPool: Not fee collector");

			await hush.connect(collector).collectFees();
			expect(await token.balanceOf(collector.address)).to.equal(expectedFee);
		});
	});*/

	describe("Bad verifiers", () => {
		it("mock verifier - always true", async () => {
			const MockVerifier = await ethers.getContractFactory("MockVerifier");
			const mock = await MockVerifier.deploy();
			await mock.deployed();

			await factory.queueVerifierUpdate(mock.address, mock.address, mock.address);
			await increaseTime(deployer, 60*60*24*7 + 600);
			await factory.setVerifiers(mock.address, mock.address, mock.address);

			let note = new Note(token.address, depositAmount);
			let oldRoot = tree.root.toString();

			// Make random deposit proof
			let depositProof = [1, 1, 1, 1, 1, 1, 1, 1];
			let depositSig = [oldRoot, oldRoot, 0, note.commitment.toString()];

			await token.connect(user).approve(hush.address, depositAmount.mul(2));

			// Deposit twice
			await hush.connect(user).deposit(depositProof, depositSig);

			depositSig = [oldRoot, oldRoot, 1, note.commitment.toString()];
			await hush.connect(user).deposit(depositProof, depositSig);

			// Withdraw without a real proof
			let withdrawProof = depositProof;
			let relayerFee = depositAmount.div(100);
			note.setIndex(0);
			let withdrawSig = [note.getNullifier().toString(), oldRoot, receiver.address, relayerFee.toString()];

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSig);

			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee));

			note.setIndex(1);
			withdrawSig = [note.getNullifier().toString(), oldRoot, receiver.address, relayerFee.toString()];

			await hush.connect(relayer).withdraw(withdrawProof, withdrawSig);
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).mul(2));
		});

		it("pause verifier, always false", async () => {
			const PauseVerifier = await ethers.getContractFactory("PauseVerifier");
			const pause = await PauseVerifier.deploy();
			await pause.deployed();

			// Create first deposit,
			let note = new Note(token.address, depositAmount);
			note.setIndex(0);
			const { solidityProof, signals } = await generateDepositProof(
				note.commitment,
				tree,
				files["SingleDeposit"]["wasm"],
				files["SingleDeposit"]["zkey"]
			);
			await token.connect(user).approve(hush.address, depositAmount);
			await hush.connect(user).deposit(solidityProof, signals);

			expect(await hush.leafCount()).to.equal(1);
			expect(await hush.getLastRoot()).to.equal(tree.root.toString());

			let oldRoot = tree.root.toString();

			await factory.queueVerifierUpdate(pause.address, pause.address, pause.address);
			await increaseTime(deployer, 60*60*24*7 + 600);
			await factory.setVerifiers(pause.address, pause.address, pause.address);

			// Try to withdraw the funds
			let relayerFee = depositAmount.div(100);
			const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(
				note,
				await receiver.getAddress(),
				relayerFee,
				tree,
				files["Withdraw"]["wasm"],
				files["Withdraw"]["zkey"]
			);
			await expect(hush.connect(relayer).withdraw(withdrawProof, withdrawSignals)).to.be.revertedWith("HushPool: invalid proof");

			// Try to deposit
			tree = new MerkleTree(depth, zero_value);
			tree.init();
			tree.insertUpdateTree(note.commitment);

			let freshNote = new Note(token.address, depositAmount);
			freshNote.setIndex(1);
			const { solidityProof: p2, signals: s2 } = await generateDepositProof(
				freshNote.commitment,
				tree,
				files["SingleDeposit"]["wasm"],
				files["SingleDeposit"]["zkey"]
			);
			await token.connect(user).approve(hush.address, depositAmount);
			await expect(hush.connect(user).deposit(p2, s2)).to.be.revertedWith("HushPool: invalid proof");

			expect(await hush.leafCount()).to.equal(1);
			expect(await hush.getLastRoot()).to.equal(oldRoot);
		});

		it("malicious verifier, true for user2", async () => {
			const CheatVerifier = await ethers.getContractFactory("CheatVerifier");
			const cheat = await CheatVerifier.connect(user2).deploy();
			await cheat.deployed();

			await factory.queueVerifierUpdate(cheat.address, cheat.address, cheat.address);
			await increaseTime(deployer, 60*60*24*7 + 600);
			await factory.setVerifiers(cheat.address, cheat.address, cheat.address);

			let note = new Note(token.address, depositAmount);
			note.setIndex(0);
			let oldRoot = tree.root.toString();

			// Make random deposit proof
			let depositProof = [1, 1, 1, 1, 1, 1, 1, 1];
			let depositSig = [oldRoot, oldRoot, 0, note.commitment.toString()];

			await token.connect(user2).approve(hush.address, depositAmount.mul(2));

			// Deposit twice
			await expect(hush.connect(user).deposit(depositProof, depositSig)).to.be.revertedWith("HushPool: invalid proof");

			await hush.connect(user2).deposit(depositProof, depositSig);
			depositSig = [oldRoot, oldRoot, 1, note.commitment.toString()];
			await hush.connect(user2).deposit(depositProof, depositSig);

			// Withdraw without a real proof
			let withdrawProof = depositProof;
			let relayerFee = depositAmount.div(100);
			note.setIndex(0);
			let withdrawSig = [note.getNullifier().toString(), oldRoot, receiver.address, relayerFee.toString()];
			await expect(hush.connect(relayer).withdraw(withdrawProof, withdrawSig)).to.be.revertedWith("HushPool: invalid proof");

			await hush.connect(user2).withdraw(withdrawProof, withdrawSig);
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee));

			note.setIndex(1);
			withdrawSig = [note.getNullifier().toString(), oldRoot, receiver.address, relayerFee.toString()];

			await hush.connect(user2).withdraw(withdrawProof, withdrawSig);
			expect(await token.balanceOf(receiver.address)).to.equal(depositAmount.sub(relayerFee).mul(2));
		});
	});
});
