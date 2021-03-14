const snarkjs = require("snarkjs");

export async function verifyProof(vkey, signals, proof) {
    return await snarkjs.groth16.verify(vkey, signals, proof);
}