import { poseidonHash2, zero_value } from "./utils";
import { toBN } from 'web3-utils';

class MerkleTree {
    zeroLeaf: any;
    depth: any;
    zeroValues: any[];
    totalElements: number;
    layers: any[];

    constructor(depth, zeroLeaf: any) {
        this.depth = depth;
        this.zeroLeaf = zeroLeaf;
        this.zeroValues = [zeroLeaf];
        this.totalElements = 0;

        let currZero = this.zeroLeaf;
        for (let i = 1; i < depth; i++) {
            currZero = poseidonHash2(currZero, currZero);
            this.zeroValues.push(currZero);
        }
        this.zeroValues.push(poseidonHash2(currZero, currZero));

    }

    get root() {
        if (this.layers.length == 0) {
            return undefined;
        }
        return this.layers[this.depth][0];
    }

    get lastIndex() {
        if (this.totalElements > 0) {
            return this.totalElements - 1;
        }
        return -1;
    }

    init() {
        this.layers = [];
        for (let i = 0; i < this.depth + 1; i++) {
            let layerSize = Math.pow(2, this.depth - i);
            this.layers.push(new Array(layerSize));
        }

        this.zeroValues = [this.zeroLeaf];
        let curr = this.zeroValues[0];
        for (let i = 1; i < this.depth + 1; i++) {
            curr = poseidonHash2(curr, curr);
            this.zeroValues.push(curr);
        }
        this.layers[this.depth][0] = curr;
    }

    /**
     * @notice This is useful for inserting and updating the root of the tree
     * Will be more efficient when having large trees with few inserted leaves.
     * @param {BigNumber} leaf The leaf that is to be inserted into the tree
     * @returns {int} index The index at which the leaf was inserted.
     */
    insertUpdateTree(leaf, forceInsert = false) {
        if (leaf == zero_value && !forceInsert) {
            return this.totalElements;
        }
        let index = this.totalElements++;
        this.layers[0][index] = leaf;

        let currentIndex = index;

        let curr = leaf;
        let left;
        let right;

        for (let i = 0; i < this.depth; i++) {
            this.layers[i][currentIndex] = curr;
            if (currentIndex % 2 == 0) {
                left = curr;
                right = this.zeroValues[i];
            } else {
                left = this.layers[i][currentIndex - 1];
                right = curr;
            }
            curr = poseidonHash2(left, right);
            currentIndex = currentIndex >> 1;
        }
        this.layers[this.depth][0] = curr;

        return index;
    }

    // This needs to take account that the tree is not actually filled.
    // Should use 
    getPath(index) {
        if (index >= this.totalElements) {
            //return Error("Index out of bounds, index >= totalElements");
        }

        let path = [];

        let currIndex = index;
        let currVal = this.layers[0][index];
        if (currVal == undefined) {
            currVal = this.zeroLeaf;
        }

        for (let i = 0; i < this.depth; i++) {
            if (currIndex % 2 == 0) { // Im left
                let left = currVal;
                let right = this.layers[i][currIndex + 1]
                if (right == undefined) {
                    right = this.zeroValues[i];
                }
                path.push(right);
                currVal = poseidonHash2(left, right);
            } else {
                let left = this.layers[i][currIndex - 1]
                if (left == undefined) {
                    left = this.zeroValues[i];
                }
                let right = currVal;
                path.push(left);
                currVal = poseidonHash2(left, right);
            }
            currIndex >>= 1;
        }

        if (this.root - currVal != 0) {
            console.log("Roots not matching");
        }

        return path;
    }
}

export {
    MerkleTree
}