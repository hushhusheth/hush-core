import { toBN } from 'web3-utils';
import { zero_value, getSolidityProofArray } from './utils';
const snarkjs = require("snarkjs");
import { readFileSync } from "fs";

import { Note } from "./note";
import { MerkleTree } from "./merkletree";

import { performance } from 'perf_hooks';
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from './prover';
import { verifyProof } from './verifier';
import { BigNumber } from '@ethersproject/bignumber';

async function main() {
    let depth = 20;
    let toInsert = 8;

    let files = {};
    let buildFolder = "./../build";

    let circuits = ["SingleDeposit", "MultiDeposit", "Withdraw"];

    for (let i = 0; i < circuits.length; i++) {
        let circuitFiles = {};
        circuitFiles["wasm"] = buildFolder + "/wasm/" + circuits[i] + ".wasm";
        circuitFiles["zkey"] = buildFolder + "/zKeys/" + circuits[i] + "_final.zkey";
        let vKeySrc = buildFolder + "/vKeys/" + circuits[i] + "Verification_key.json";
        circuitFiles["vkey"] = JSON.parse(readFileSync(vKeySrc).toString());
        files[circuits[i]] = circuitFiles;
    }

    let tree = new MerkleTree(depth, zero_value);
    tree.init();

    console.log("Empty tree initiated");
    console.log("Initiate single deposit")

    let note = new Note("", BigNumber.from(1000));
    let com = note.commitment;
    let t0 = performance.now();
    const { proof: depositProof, signals: depositSignals } = await generateDepositProof(com, tree, files["SingleDeposit"]["wasm"], files["SingleDeposit"]["zkey"]);
    let t1 = performance.now();
    console.log("Single deposit proof generated in: ", (t1 - t0), "ms");

    t0 = performance.now();
    let validSingleDeposit = await verifyProof(files["SingleDeposit"]["vkey"], depositSignals, depositProof);
    t1 = performance.now();
    console.log("Proof verified to ", validSingleDeposit, " in ", (t1 - t0), "ms");


    let depositNotes = [];
    let commits = [];
    for (let i = 0; i < toInsert; i++) {
        let n = new Note("", BigNumber.from(1000));
        depositNotes.push(n);
        commits.push(n.commitment);
    }
    
    t0 = performance.now();
    const { proof: multiDepositProof, signals: multiDepositSignals } = await generateMultiDepositProof(commits, tree, files["MultiDeposit"]["wasm"], files["MultiDeposit"]["zkey"]);
    t1 = performance.now();
    console.log(toInsert, " commitments inserted into tree, total size: ", tree.totalElements);
    console.log("Deposit proof generated in: ", (t1 - t0), "ms");

    t0 = performance.now();
    let validDeposit = await verifyProof(files["MultiDeposit"]["vkey"], multiDepositSignals, multiDepositProof);
    t1 = performance.now();
    console.log("Proof verified to ", validDeposit, " in ", (t1 - t0), "ms");

    console.log("Withdraw first commitment");
    let receiver = "642829559307850963015472508762062935916233390536";
    t0 = performance.now();
    const { proof: wProof, signals: wSignals } = await generateWithdrawProof(depositNotes[0], 1, receiver, 100, tree, files["Withdraw"]["wasm"], files["Withdraw"]["zkey"]);
    t1 = performance.now();
    console.log("Withdraw proof generated in: ", (t1 - t0), "ms");

    t0 = performance.now();
    let validWithdraw = await verifyProof(files["Withdraw"]["vkey"], wSignals, wProof);
    // snarkjs.groth16.verify(files["Withdraw"]["vkey"], wSignals, wProof);
    t1 = performance.now();
    console.log("Proof verified to ", validWithdraw, " in ", (t1 - t0), "ms");
}

main().then(() => {
    process.exit(0);
}).catch((err) => {
    console.log(err);
    process.exit(1);
});