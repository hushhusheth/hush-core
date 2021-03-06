import { zero_value, getSolidityProofArray } from "./utils";
//import * as snarkjs from "snarkjs";
import { Note } from "./note";
import { MerkleTree } from "./merkletree";
import { BigNumber } from "ethers";

const snarkjs = require("snarkjs");

export async function generateDepositProof(_commit, _tree: MerkleTree, wasm: string, zkey: string, clean = false) {
	let depositInput: { pathElements: any[][]; oldRoot: string; index: number } = {
		pathElements: [],
		oldRoot: _tree.root.toString(10),
		index: _tree.totalElements,
	};
	_tree.insertUpdateTree(_commit);

	depositInput["commitments"] = _commit.toString(10);
	let path = _tree.getPath(depositInput["index"]);
	depositInput["pathElements"].push(path.map((p) => p.toString(10)));

	if (clean) {
		_tree.insertUpdateTree(zero_value, true, depositInput["index"]);
		_tree.totalElements--;
	}

	const { proof, publicSignals } = await snarkjs.groth16.fullProve(depositInput, wasm, zkey);
	let solidityProof = getSolidityProofArray(proof);

	return { proof: proof, signals: publicSignals, solidityProof: solidityProof };
}

export async function generateMultiDepositProof(
	_commits,
	_tree: MerkleTree,
	wasm: string,
	zkey: string,
	clean = false,
	forceInsert = false,
) {
	let depositInput: { commitments: string[]; pathElements: string[][]; oldRoot: string; index: number } = {
		commitments: [],
		pathElements: [],
		oldRoot: _tree.root.toString(10),
		index: _tree.totalElements,
	};

	for (let i = 0; i < 8; i++) {
		let commit = zero_value;
		if (i < _commits.length) {
			commit = _commits[i];
		}
		depositInput["commitments"].push(commit.toString(10));
		_tree.insertUpdateTree(commit, forceInsert);
		let path = _tree.getPath(depositInput["index"] + i);
		depositInput["pathElements"].push(path.map((p) => p.toString(10)));
	}
	if (clean) {
		for (let i = 0; i < 8; i++) {
			_tree.insertUpdateTree(zero_value, true, depositInput["index"] + i);
			if (i < _commits.length) {
				_tree.totalElements--;
			}
		}
	}

	const { proof, publicSignals } = await snarkjs.groth16.fullProve(depositInput, wasm, zkey);
	let solidityProof = getSolidityProofArray(proof);

	return { proof: proof, signals: publicSignals, solidityProof: solidityProof };
}

export async function generateWithdrawProof(
	_note: Note,
	_receiver,
	_fee,
	_tree: MerkleTree,
	wasm: string,
	zkey: string
) {
	let withdrawPath = _tree.getPath(_note.index).map((p) => p.toString(10));
	let receiver = BigNumber.from(_receiver).toString();

	if (_note.index == undefined){
		console.log(`Note: no index provided`);
	}

	let withdrawInput = {
		root: _tree.root.toString(),
		receiver: receiver,
		fee: _fee,
		secret: _note.secret.toString(),
		nonce: _note.nonce.toString(),
		index: _note.index,
		pathElements: withdrawPath,
	};

	const { proof, publicSignals } = await snarkjs.groth16.fullProve(withdrawInput, wasm, zkey);
	let solidityProof = getSolidityProofArray(proof);

	return { proof: proof, signals: publicSignals, solidityProof: solidityProof };
}
