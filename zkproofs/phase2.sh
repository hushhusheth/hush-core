#!/bin/sh

# Clean current build, and make a new.
echo "Clearing old build, preparing for new."
rm -rf build
mkdir build
mkdir ./build/r1cs
mkdir ./build/wasm
mkdir ./build/vKeys
mkdir ./build/zKeys
mkdir ./build/sol

# Create build for Single Deposit
echo "Initiate generation for Single Deposit"
circom circuits/SingleDeposit.circom -r ./build/r1cs/SingleDeposit.r1cs -w ./build/wasm/SingleDeposit.wasm
snarkjs info -c build/r1cs/SingleDeposit.r1cs
snarkjs zkey new ./build/r1cs/SingleDeposit.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/SingleDeposit_0000.zkey
snarkjs zkey contribute ./build/zKeys/SingleDeposit_0000.zkey ./build/zKeys/SingleDeposit_final.zkey --name="Hush Hush developer" 
snarkjs zkey export verificationkey ./build/zKeys/SingleDeposit_final.zkey ./build/vKeys/SingleDepositVerification_key.json
snarkjs zkey export solidityverifier ./build/zKeys/SingleDeposit_final.zkey ./build/sol/SingleDepositVerifier.sol

# Create build for Multiple Deposit
echo "Initiate generation for Multi Deposit"
circom circuits/MultiDeposit.circom -r ./build/r1cs/MultiDeposit.r1cs -w ./build/wasm/MultiDeposit.wasm
snarkjs info -c build/r1cs/MultiDeposit.r1cs
snarkjs zkey new ./build/r1cs/MultiDeposit.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/MultiDeposit_0000.zkey
snarkjs zkey contribute ./build/zKeys/MultiDeposit_0000.zkey ./build/zKeys/MultiDeposit_final.zkey --name="Hush Hush developer" 
snarkjs zkey export verificationkey ./build/zKeys/MultiDeposit_final.zkey ./build/vKeys/MultiDepositVerification_key.json
snarkjs zkey export solidityverifier ./build/zKeys/MultiDeposit_final.zkey ./build/sol/MultiDepositVerifier.sol

# Create build for Withdraw
echo "Initiate generation for withdraw"
circom circuits/Withdraw.circom -r ./build/r1cs/Withdraw.r1cs -w ./build/wasm/Withdraw.wasm
snarkjs info -c build/r1cs/Withdraw.r1cs
snarkjs zkey new ./build/r1cs/Withdraw.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/Withdraw_0000.zkey
snarkjs zkey contribute ./build/zKeys/Withdraw_0000.zkey ./build/zKeys/Withdraw_final.zkey --name="Hush Hush developer" 
snarkjs zkey export verificationkey ./build/zKeys/Withdraw_final.zkey ./build/vKeys/WithdrawVerification_key.json
snarkjs zkey export solidityverifier ./build/zKeys/Withdraw_final.zkey ./build/sol/WithdrawVerifier.sol