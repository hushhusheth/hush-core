// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import {
    Verifier as DepositVerifier
} from "./../../zkproofs/build/sol/SingleDepositVerifier.sol";
import {
    Verifier as DepositVerifier8
} from "./../../zkproofs/build/sol/MultiDepositVerifier.sol";
import {
    Verifier as WithdrawVerifier
} from "./../../zkproofs/build/sol/WithdrawVerifier.sol";

contract MockVerifier {
    /// @return r  bool true if proof is valid
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[4] memory input
    ) public view returns (bool r) {
        return true;
    }

    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[11] memory input
    ) public view returns (bool r) {
        return true;
    }
}
