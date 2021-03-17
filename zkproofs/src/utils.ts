import { babyJub, pedersenHash, poseidon } from 'circomlib';
import { toBN } from 'web3-utils';

const utils = require("ffjavascript").utils;

import { randomBytes } from 'crypto';

const pedersenHashBuffer = (buffer) => toBN(babyJub.unpackPoint(pedersenHash.hash(buffer))[0].toString())

const poseidonHash = (items) => toBN(poseidon(items).toString())
const poseidonHash2 = (a, b) => poseidonHash([a, b])

/** Generate random number of specified byte length */
const randomBN = (nbytes = 31) => toBN(utils.leBuff2int(randomBytes(nbytes)).toString())
//const randomBN = (nbytes = 31) => toBN(randomBytes(nbytes).readBigUInt64LE().toString(10));
//const randomBN = (nbytes = 31) => toBN(BigIntBuffer.toBigIntLE(randomBytes(nbytes)).toString())


const toFixedHex = (number, length = 32) => {
    return '0x' +
        (number instanceof Buffer ? number.toString('hex') : BigInt(number).toString(16).padStart(length * 2, '0'));
}

// uint256(keccak256(abi.encodePacked("HushHush"))) % SNARK_SCALAR_FIELD;
const zero_value = toBN('10040938200627430310828075205244513358216211203724055178857443267945086138226');
const field = toBN("21888242871839275222246405745257275088548364400416034343698204186575808495617");


function getSolidityProofArray(proof) {
    let proofList = [
        proof["pi_a"][0], proof["pi_a"][1],
        proof["pi_b"][0][1], proof["pi_b"][0][0],
        proof["pi_b"][1][1], proof["pi_b"][1][0],
        proof["pi_c"][0], proof["pi_c"][1]
    ];
    return proofList;
}

function bitsToNumber(bits) {
    let result = 0
    for (const item of bits.slice().reverse()) {
        result = (result << 1) + item
    }
    return result
}

export {
    randomBN,
    pedersenHashBuffer,
    bitsToNumber,
    poseidonHash,
    poseidonHash2,
    zero_value,
    field,
    getSolidityProofArray,
    toFixedHex,
    toBN
}