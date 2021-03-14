//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

contract ProofUtil {
    uint256 constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function areAllValidFieldElements(uint256[8] memory _proof)
        internal
        pure
        returns (bool)
    {
        return
            _proof[0] < SNARK_SCALAR_FIELD &&
            _proof[1] < SNARK_SCALAR_FIELD &&
            _proof[2] < SNARK_SCALAR_FIELD &&
            _proof[3] < SNARK_SCALAR_FIELD &&
            _proof[4] < SNARK_SCALAR_FIELD &&
            _proof[5] < SNARK_SCALAR_FIELD &&
            _proof[6] < SNARK_SCALAR_FIELD &&
            _proof[7] < SNARK_SCALAR_FIELD;
    }

    function unpackProof(uint256[8] memory _proof)
        public
        pure
        returns (
            uint256[2] memory,
            uint256[2][2] memory,
            uint256[2] memory
        )
    {
        return (
            [_proof[0], _proof[1]],
            [[_proof[2], _proof[3]], [_proof[4], _proof[5]]],
            [_proof[6], _proof[7]]
        );
    }
}
