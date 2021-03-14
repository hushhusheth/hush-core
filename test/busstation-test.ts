import { expect } from "chai";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
const hre: HardhatRuntimeEnvironment = require("hardhat");

import { ethers, deployments } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { PERMIT_TYPEHASH, getPermitDigest, getDomainSeparator, sign } from './../utils/signatures';

import { zero_value } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { ADDRESSES } from "../utils/addresses";
import { files } from "./../utils/zkfiles";
import { getNamedSigners } from 'hardhat-deploy-ethers/dist/src/helpers';
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signer-with-address';

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

describe("Bus Station", function () {

    let depth = 20;
    let busSize = 8;

    let token: Contract;
    let hush: Contract;
    let station: Contract;
    let tree: MerkleTree;

    let poolFactory: Contract;

    let depositAmount: BigNumber;
    let feeSize = BigNumber.from(50);

    beforeEach(async function () {
        await deployments.fixture("MorePools");
        tree = new MerkleTree(depth, zero_value);
        tree.init();

        const poolFactoryAddress = (await deployments.get("PoolFactory")).address;
        poolFactory = await ethers.getContractAt("HushFactory", poolFactoryAddress);
    });


    describe("simple erc20", async () => {

        beforeEach(async () => {
            depositAmount = fromToken("1000");

            const ERC20 = await ethers.getContractFactory("ERC20Tester");
            token = await ERC20.deploy(fromToken("100000"));
            await token.deployed();

            await poolFactory.deployERCPool(token.address, depositAmount);
            let freshAddress = await poolFactory.getERCPool(token.address, depositAmount);

            const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
            hush = ERCHushPool.attach(freshAddress);
            await hush.deployed();

            //hush = await HushPool.deploy(depositVerifier.address, multiDepositVerifier.address, withdrawVerifier.address, tree.root.toString(), depth, token.address);
            expect(await hush.getLastRoot()).to.equal(tree.root.toString());
            expect(await hush.leafCount()).to.equal(0);

            await hush.deployed();

            const BusStation = await ethers.getContractFactory("BusStation");
            station = await BusStation.deploy(hush.address);
            await station.deployed();
        });

        it("buy tickets 7 normal, 1 with permit. Then drive bus and withdraw 1", async function () {
            let [user1, user2, user3, user4, user5, user6, user7, user8, busdriver] = await ethers.getSigners();
            let users = [user1, user2, user3, user4, user5, user6, user7];

            const ownerPrivateKey = Buffer.from('c5e8f61d1ab959b397eecc0a37a6517b8e67a0e7cf1f4bce5591f3ed80199122', 'hex')
            let wallet = new ethers.Wallet(ownerPrivateKey, user8.provider);

            await user1.sendTransaction({ to: await wallet.getAddress(), value: BigNumber.from("10000000000000000000").toHexString() });

            let depositBools = [true, true, true, true, true, true, true, true];
            let notes = depositBools.map(b => new Note(token.address, BigNumber.from(1000)));
            let commits = notes.map(c => c.commitment);
            let receiverAddress = await user8.getAddress();

            let { solidityProof: depositProof, signals: depositSignals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            for (let i = 0; i < notes.length; i++) {
                notes[i].setIndex(tree.totalElements - (notes.length - i));
            }

            let busFee = fromToken("10");

            for (let i = 1; i < 7; i++) {
                await token.transfer(await users[i].getAddress(), depositAmount.mul(2));
            }
            await token.transfer(await wallet.getAddress(), depositAmount.mul(2));

            for (let i = 0; i < 7; i++) {
                await token.connect(users[i]).approve(station.address, depositAmount.mul(2).mul(2));
                await station.connect(users[i]).buyTicket(depositSignals[3 + i], busFee);
            }

            // Let us have the last user use a permit
            const approve = {
                owner: await wallet.getAddress(),
                spender: station.address,
                value: depositAmount.add(busFee),
            };

            let deadline = 100000000000000;
            let nonce = await token.nonces(await wallet.getAddress());
            let name = await token.name();
            let chainId = 31337;

            expect(await token.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(name, token.address, chainId));
            expect(await token.PERMIT_TYPEHASH()).to.equal(PERMIT_TYPEHASH);
            const digest = getPermitDigest(name, token.address, chainId, approve, nonce, deadline);
            let { v, r, s } = sign(digest, ownerPrivateKey);
            await station.connect(wallet).buyTicketWithPermit(depositSignals[10], busFee, approve.value, deadline, v, r, s);

            expect(await token.balanceOf(hush.address)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(0);
            expect(await hush.leafCount()).to.equal(0);

            // Drive the bus
            await station.connect(busdriver).driveBus(depositProof, depositSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(8));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(busFee.mul(8));
            expect(await hush.leafCount()).to.equal(8);

            let index = 0;
            let note = notes[index];
            let withdrawFee = fromToken("50");
            const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiverAddress, withdrawFee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

            await hush.connect(busdriver).withdraw(withdrawProof, withdrawSignals);

            // We need to check stuff here
            let protocolFee = depositAmount.mul(feeSize).div(10000);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(7).add(protocolFee));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(depositAmount.sub(withdrawFee.add(protocolFee)));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(busFee.mul(8).add(withdrawFee));
            expect(await hush.leafCount()).to.equal(8);
        });

        it("buy tickets 3 normal and use 5 own commits. Then drive bus and withdraw 1", async function () {
            let [user1, user2, user3, user4, user5, user6, user7, user8, busdriver] = await ethers.getSigners();
            let users = [user1, user2, user3, user4, user5, user6, user7];

            let depositBools = [true, true, true, true, true, true, true, true];
            let notes = depositBools.map(b => new Note(token.address, depositAmount));
            let commits = notes.map(c => c.commitment);
            let receiverAddress = await user8.getAddress();

            let { solidityProof: depositProof, signals: depositSignals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            for (let i = 0; i < notes.length; i++) {
                notes[i].setIndex(tree.totalElements - (notes.length - i));
            }

            let fee = fromToken("10");

            for (let i = 0; i < 3; i++) {
                if (i > 0) {
                    await token.transfer(await users[i].getAddress(), depositAmount.mul(2));
                }
                await token.connect(users[i]).approve(station.address, depositAmount.mul(2));
                await station.connect(users[i]).buyTicket(depositSignals[3 + i], fee);
            }

            expect(await token.balanceOf(hush.address)).to.equal(0);
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(0);
            expect(await hush.leafCount()).to.equal(0);

            // Busdriver approves for 5 deposits
            await token.transfer(await busdriver.getAddress(), depositAmount.mul(5));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(depositAmount.mul(5));
            await token.connect(busdriver).approve(station.address, depositAmount.mul(5));

            // Drive the bus
            await station.connect(busdriver).driveBus(depositProof, depositSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(8));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(fee.mul(3));
            expect(await hush.leafCount()).to.equal(8);

            let index = 0;
            let note = notes[index];
            let withdrawFee = fromToken("50");
            const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiverAddress, withdrawFee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

            let protocolFee = depositAmount.mul(feeSize).div(10000);
            await hush.connect(busdriver).withdraw(withdrawProof, withdrawSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(7).add(protocolFee));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(depositAmount.sub(withdrawFee.add(protocolFee)));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(fee.mul(3).add(withdrawFee));
            expect(await hush.leafCount()).to.equal(8);
        });
    });

    describe("compound interest bearing ether", () => {

        beforeEach(async () => {
            token = await ethers.getContractAt("CEther", ADDRESSES["ceth"]);

            // get CEther
            let ethAmount = fromToken("100", 18);
            await token.mint({ value: ethAmount });

            depositAmount = fromToken("50", 8);

            //await poolFactory.deployERCPool(token.address, depositAmount);
            let freshAddress = await poolFactory.getERCPool(token.address, depositAmount);

            const ERCHushPool = await ethers.getContractFactory("ERCHushPool");
            hush = ERCHushPool.attach(freshAddress);
            await hush.deployed();

            //hush = await HushPool.deploy(depositVerifier.address, multiDepositVerifier.address, withdrawVerifier.address, tree.root.toString(), depth, token.address);
            expect(await hush.getLastRoot()).to.equal(tree.root.toString());
            expect(await hush.leafCount()).to.equal(0);

            await hush.deployed();

            const BusStation = await ethers.getContractFactory("BusStation");
            station = await BusStation.deploy(hush.address);
            await station.deployed();
        });

        it("buy 8 tickets. Then drive bus and withdraw 1", async function () {
            let [user1, user2, user3, user4, user5, user6, user7, user8, busdriver, receiver] = await ethers.getSigners();
            let users = [user1, user2, user3, user4, user5, user6, user7, user8];

            let depositBools = [true, true, true, true, true, true, true, true];
            let notes = depositBools.map(b => new Note(token.address, BigNumber.from(1000)));
            let commits = notes.map(c => c.commitment);
            let receiverAddress = await receiver.getAddress();

            let { solidityProof: depositProof, signals: depositSignals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            for (let i = 0; i < notes.length; i++) {
                notes[i].setIndex(tree.totalElements - (notes.length - i));
            }

            let busFee = fromToken("0.01", 8);

            for (let i = 1; i < 8; i++) {
                await token.transfer(await users[i].getAddress(), depositAmount.mul(2));
            }

            for (let i = 0; i < 8; i++) {
                await token.connect(users[i]).approve(station.address, depositAmount.mul(2).mul(2));
                await station.connect(users[i]).buyTicket(depositSignals[3 + i], busFee);
            }

            expect(await token.balanceOf(hush.address)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(0);
            expect(await hush.leafCount()).to.equal(0);

            // Drive the bus
            await station.connect(busdriver).driveBus(depositProof, depositSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(8));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(busFee.mul(8));
            expect(await hush.leafCount()).to.equal(8);

            let index = 0;
            let note = notes[index];
            let withdrawFee = fromToken("0.05", 8);
            const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiverAddress, withdrawFee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

            await hush.connect(busdriver).withdraw(withdrawProof, withdrawSignals);

            // We need to check stuff here
            let protocolFee = depositAmount.mul(feeSize).div(10000);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(7).add(protocolFee));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(depositAmount.sub(withdrawFee.add(protocolFee)));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(busFee.mul(8).add(withdrawFee));
            expect(await hush.leafCount()).to.equal(8);
        });

        it("buy tickets 3 normal and use 5 own commits. Then drive bus and withdraw 1", async function () {
            let [user1, user2, user3, user4, user5, user6, user7, user8, busdriver, receiver] = await ethers.getSigners();
            let users = [user1, user2, user3, user4, user5, user6, user7];

            let depositBools = [true, true, true, true, true, true, true, true];
            let notes = depositBools.map(b => new Note(token.address, depositAmount));
            let commits = notes.map(c => c.commitment);
            let receiverAddress = await receiver.getAddress();

            let { solidityProof: depositProof, signals: depositSignals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            for (let i = 0; i < notes.length; i++) {
                notes[i].setIndex(tree.totalElements - (notes.length - i));
            }

            let fee = fromToken("0.01", 8);

            for (let i = 0; i < 3; i++) {
                if (i > 0) {
                    await token.transfer(await users[i].getAddress(), depositAmount.mul(2));
                }
                await token.connect(users[i]).approve(station.address, depositAmount.mul(2));
                await station.connect(users[i]).buyTicket(depositSignals[3 + i], fee);
            }

            expect(await token.balanceOf(hush.address)).to.equal(0);
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(0);
            expect(await hush.leafCount()).to.equal(0);

            // Busdriver approves for 5 deposits
            await token.transfer(await busdriver.getAddress(), depositAmount.mul(5));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(depositAmount.mul(5));
            await token.connect(busdriver).approve(station.address, depositAmount.mul(5));

            // Drive the bus
            await station.connect(busdriver).driveBus(depositProof, depositSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(8));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(0);
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(fee.mul(3));
            expect(await hush.leafCount()).to.equal(8);

            let index = 0;
            let note = notes[index];
            let withdrawFee = fromToken("0.05", 8);
            const { solidityProof: withdrawProof, signals: withdrawSignals } = await generateWithdrawProof(note, receiverAddress, withdrawFee, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);

            let protocolFee = depositAmount.mul(feeSize).div(10000);
            await hush.connect(busdriver).withdraw(withdrawProof, withdrawSignals);
            expect(await token.balanceOf(hush.address)).to.equal(depositAmount.mul(7).add(protocolFee));
            expect(await token.balanceOf(station.address)).to.equal(0);
            expect(await token.balanceOf(receiverAddress)).to.equal(depositAmount.sub(withdrawFee.add(protocolFee)));
            expect(await token.balanceOf(await busdriver.getAddress())).to.equal(fee.mul(3).add(withdrawFee));
            expect(await hush.leafCount()).to.equal(8);
        });
    });


});