include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/pedersen.circom";

// We can optimize the circuit later. Probably better to join these two, lot of overlap.

template CommitmentNullifierHasher() {
    signal input secret;
    signal input nonce;
    signal input index;

    signal output commitment;
    signal output nullifier;

    component commitmentHasher = Pedersen(496);
    component nullifierHasher = Pedersen(496);

    component secretBits = Num2Bits(248);
    component nonceBits = Num2Bits(248);
    component indexBits = Num2Bits(248); // Would only need depth of tree (20);

    secretBits.in <== secret;
    nonceBits.in <== nonce;
    indexBits.in <== index;

    for(var i = 0; i < 248; i++){
        commitmentHasher.in[i] <== secretBits.out[i];
        commitmentHasher.in[i + 248] <== nonceBits.out[i];

        nullifierHasher.in[i] <== secretBits.out[i];
        nullifierHasher.in[i + 248] <== indexBits.out[i];
    }    

    commitment <== commitmentHasher.out[0];
    nullifier <== nullifierHasher.out[0];
}

// Computes a Pedersen Hash of (secret + nonce)
template CommitmentHasher() {
    signal input secret;
    signal input nonce;

    signal output commitment;

    component commitmentHasher = Pedersen(496);

    component secretBits = Num2Bits(248);
    component nonceBits = Num2Bits(248);
    

    secretBits.in <== secret;
    nonceBits.in <== nonce;

    for(var i = 0; i < 248; i++) {
        commitmentHasher.in[i] <== secretBits.out[i];
        commitmentHasher.in[i + 248] <== nonceBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
}

// Computes a Pedersen Hash of (secret + index)
template NullifierHasher() {
    signal input secret;
    signal input index;

    signal output nullifier;

    component nullifierHasher = Pedersen(496);
    
    component secretBits = Num2Bits(248);
    component indexBits = Num2Bits(248); // Would only need depth of tree (20);

    secretBits.in <== secret;
    indexBits.in <== index;

    for(var i = 0; i < 248; i++){
        nullifierHasher.in[i] <== secretBits.out[i];
        nullifierHasher.in[i + 248] <== indexBits.out[i];
    }

    nullifier <== nullifierHasher.out[0];
}
