include "./Utils.circom";
include "./MerkleTree.circom";

template Withdraw(levels) {
    signal input root;
    signal input receiver;
    signal input fee;
    
    signal private input secret;
    signal private input nonce;
    signal private input index;
    signal private input pathElements[levels];

    signal output nullifier;

    component commitmentHasher = CommitmentNullifierHasher();
    commitmentHasher.secret <== secret;
    commitmentHasher.nonce <== nonce;
    commitmentHasher.index <== index;

    component merkleTree = MerkleTree(levels);
    merkleTree.leaf <== commitmentHasher.commitment;
    merkleTree.pathIndex <== index;

    for(var i = 0; i < levels; i++){
        merkleTree.pathElements[i] <== pathElements[i];
    }

    root === merkleTree.root;
    nullifier <== commitmentHasher.nullifier;

    // To ensure that fee and receiver is included in the proof
    signal receiverSquared;
    signal feeSquared;

    receiverSquared <== receiver * receiver;
    feeSquared <== fee * fee;
}

component main = Withdraw(20);