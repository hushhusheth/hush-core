#!/bin/sh

echo "Verifying Phase 1"
snarkjs powersoftau verify ./pot/powersOfTau28_hez_final_17.ptau

echo "Verifying Phase 2"
echo "Verify deposit"
snarkjs zkey verify ./build/r1cs/SingleDeposit.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/SingleDeposit_final.zkey
echo "Verify multi deposit"
snarkjs zkey verify ./build/r1cs/MultiDeposit.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/MultiDeposit_final.zkey
echo "Verify withdraw"
snarkjs zkey verify ./build/r1cs/Withdraw.r1cs ./pot/powersOfTau28_hez_final_17.ptau ./build/zKeys/Withdraw_final.zkey
