include "./Utils.circom";
include "./MerkleTree.circom";
include "./MerkleTreeUpdater.circom";

template Deposit(num, levels, zeroLeaf) {
    signal input oldRoot;
    signal input index;
    signal input commitments[num];

    // PathElements is public knowledge, but we use private to minimize inputs in verifier
    signal private input pathElements[num][levels]; 
    
    signal output newRoot;

    signal roots[num + 1]; // Before inserts
    roots[0] <== oldRoot;

    component treeUpdaters[num];

    for(var i = 0; i < num; i++){
        treeUpdaters[i] = MerkleTreeUpdater(levels, zeroLeaf);

        treeUpdaters[i].oldRoot <== roots[i];
        treeUpdaters[i].leaf <== commitments[i];
        treeUpdaters[i].pathIndices <== index + i;
        for(var j = 0; j < levels; j++){
            treeUpdaters[i].pathElements[j] <== pathElements[i][j];
        }

        roots[i + 1] <== treeUpdaters[i].newRoot;
    }

    newRoot <== roots[num];
}