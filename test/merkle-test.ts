import { expect } from "chai";

import { zero_value, randomBN, toFixedHex } from "../zkproofs/src/utils";
import { Note } from "../zkproofs/src/note";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { BigNumber } from "@ethersproject/bignumber";


describe("Merkle tree", () => {

    let depth = 5;

    it("fill tree of depth 5", async () => {
        let tree = new MerkleTree(depth, zero_value);
        tree.init();

        for (let i = 0; i < Math.pow(2, tree.depth); i++) {
            let note = new Note("random", BigNumber.from(1000));
            tree.insertUpdateTree(note.commitment);
        }
    });

    it("fill tree of depth 5, add zeros as well", async () => {
        let tree = new MerkleTree(depth, zero_value);
        tree.init();

        for (let i = 0; i < Math.pow(2, tree.depth); i++) {
            if (i % 3 == 0) {
                tree.insertUpdateTree(zero_value);
            } else {
                let note = new Note("random", BigNumber.from(1000));
                tree.insertUpdateTree(note.commitment);
            }
        }
    });


});