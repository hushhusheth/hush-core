#!/usr/bin/env ts-node

import { MerkleTree } from "../zkproofs/src/merkletree";
import { zero_value, toFixedHex } from "../zkproofs/src/utils";
import { BigNumber } from "@ethersproject/bignumber";
import { Note } from "../zkproofs/src/note";

import { buildTree } from "../utils/treebuilder";
import { generateDepositProof, generateMultiDepositProof, generateWithdrawProof } from "../zkproofs/src/prover";

import { ethers } from "ethers";

//const formatAddress = (addr: string) => chalk.bold(chalk.green(addr));
const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

import { Command, option } from 'commander';

const program = new Command();

program
	.option('-r, --rpc <address>', 'the rpc for retrieving tree')
	.option('-t, --token <address>', 'the token for the pool')
	.option('-a, --amount <bignumber>', 'the amount of tokens for the pool', '1')
	.option('-s, --single', 'generates single deposit proof')
	.option('-m, --multi', 'generates a multi deposit proof')
	.option('-w, --withdraw', 'generates a withdraw proof');

program.parse(process.argv);

const options = program.opts();

if (options.token && options.amount) {
	console.log(`Pool: ${options.amount} ${options.token}`);
} else {
	console.log("Require both token and ")
}

async function single() {

};

async function multi() {

}

async function withdraw() {

}