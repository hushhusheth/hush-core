
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";

import { randomBN, zero_value } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";
import { verifyProof } from "../zkproofs/src/verifier";

let depth = 20;

import { files } from "./../utils/zkfiles";

describe("Wasm prover and verifier", function () {

    describe("single deposits", () => {

        it("single deposit", async function () {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();
            let note = new Note("", BigNumber.from(1000));
            const { proof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
            expect(await verifyProof(files["SingleDeposit"]["vkey"], signals, proof)).to.equal(true);
        });

        it("single deposit and withdraw", async function () {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();
            let note = new Note("", BigNumber.from(1000));
            note.setIndex(0);
            const { proof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
            expect(await verifyProof(files["SingleDeposit"]["vkey"], signals, proof)).to.equal(true);

            let receiver = "642829559307850963015472508762062935916233390536";
            const { proof: wProof, signals: wSignals } = await generateWithdrawProof(note, receiver, 100, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
            expect(await verifyProof(files["Withdraw"]["vkey"], wSignals, wProof)).to.equal(true);
        });

        it("single deposit - changed signals", async () => {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();
            let note = new Note("", BigNumber.from(1000));
            note.setIndex(0);
            const { proof, signals } = await generateDepositProof(note.commitment, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);

            // Change values afterwards
            const temp = (_in: []) => {
                let t = [];
                _in.forEach(element => {
                    t.push(element);
                });
                return t;
            };

            for (let i = 0; i < signals.length; i++) {
                let tempSigs = temp(signals);
                tempSigs[i] = randomBN(28).toString();
                expect(await verifyProof(files["SingleDeposit"]["vkey"], tempSigs, proof)).to.equal(false);
            }
        });

    });

    describe("multi deposits", () => {

        it("multi deposit", async function () {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();

            let commits = [];
            for (let i = 0; i < 8; i++) {
                commits.push(new Note("", BigNumber.from(1000)).commitment);
            }

            const { proof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            expect(await verifyProof(files["MultiDeposit"]["vkey"], signals, proof)).to.equal(true);
        });


        it("multi deposit and withdraw", async function () {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();

            let note = new Note("", BigNumber.from(1000));
            note.setIndex(0);
            let commits = [note.commitment];
            for (let i = 1; i < 8; i++) {
                commits.push(new Note("", BigNumber.from(1000)).commitment);
            }

            const { proof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            expect(await verifyProof(files["MultiDeposit"]["vkey"], signals, proof)).to.equal(true);

            let receiver = "642829559307850963015472508762062935916233390536";
            const { proof: wProof, signals: wSignals } = await generateWithdrawProof(note, receiver, 100, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
            expect(await verifyProof(files["Withdraw"]["vkey"], wSignals, wProof)).to.equal(true);
        });

        it("multi deposit and withdraw - wrong index", async () => {
            let tree = new MerkleTree(depth, zero_value);
            tree.init();

            let note = new Note("", BigNumber.from(1000));
            note.setIndex(1);
            let commits = [note.commitment];
            for (let i = 1; i < 8; i++) {
                commits.push(new Note("", BigNumber.from(1000)).commitment);
            }

            const { proof, signals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
            expect(await verifyProof(files["MultiDeposit"]["vkey"], signals, proof)).to.equal(true);

            let receiver = "642829559307850963015472508762062935916233390536";
            const { proof: wProof, signals: wSignals } = await generateWithdrawProof(note, receiver, 100, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
            expect(await verifyProof(files["Withdraw"]["vkey"], wSignals, wProof)).to.equal(false);
        });

    });


})