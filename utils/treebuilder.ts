import { Contract } from "ethers";
import { MerkleTree } from "../zkproofs/src/merkletree";
import { zero_value } from "../zkproofs/src/utils";
import { expect } from "chai";


async function buildTree(hush: Contract, depth: number): Promise<MerkleTree> {
    // Read the events
    let filter = hush.filters.Deposit();
    let res = await hush.queryFilter(filter, 0, 'latest');

    //console.log("Number of leafs: ", res.length);

    let leafs = res.map(event => {
        return { index: event.args["_index"], leaf: event.args["_commitment"] };
    });

    // Let us compute the shit for the real leafs!
    let compare = (a: { "index": Number; }, b: { "index": Number; }) => {
        if (Number(a["index"]) < Number(b["index"])) {
            return -1;
        } else {
            return 1;
        }
    }

    leafs.sort(compare);

    let tree = new MerkleTree(depth, zero_value);
    tree.init();

    leafs.forEach(leaf => {
        tree.insertUpdateTree(leaf.leaf);
        //console.log(`Added ${leaf.index}: ${leaf.leaf.toString()}, root is : ${tree.root.toString()}`);
    });

    expect(await hush.leafCount()).to.equal(tree.totalElements, "Number of deposits not matching");
    expect(await hush.getLastRoot()).to.equal(tree.root.toString(), "Roots not matching");

    return new Promise((resolve, reject) => {
        resolve(tree);
    });
}

export { buildTree };