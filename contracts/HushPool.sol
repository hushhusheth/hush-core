//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IVerifier} from "./Interfaces/IVerifier.sol";
import {IHushPool} from "./Interfaces/IHushPool.sol";
import {IHushFactory} from "./Interfaces/IHushFactory.sol";

import {ProofUtil} from "./ProofUtil.sol";

import {Context} from "@openzeppelin/contracts/utils/Context.sol";

abstract contract HushPool is ProofUtil, IHushPool {
    address public override factory;
    bool isInitialised;

    uint256 public override leafCount;
    uint256 public override treesize;

    uint256 public constant override ZEROLEAF =
        uint256(keccak256(abi.encodePacked("HushHush"))) % SNARK_SCALAR_FIELD;

    uint32 public rootIndex;
    uint32 public constant ROOT_HISTORY_SIZE = 100;
    uint256[ROOT_HISTORY_SIZE] public roots;
    mapping(uint256 => bool) public  override nullifiers;

    event Deposit(uint256 _commitment, uint256 _index);
    event Withdraw(uint256 _nullifier, address _receiver, uint256 _fee);

    constructor() public {}

    /**
     * @dev initialize the contract, NOTICE that anyone can call this
     */
    function initialize() public override {
        require(!isInitialised, "HushPool: Already initialized");
        isInitialised = true;
        factory = msg.sender;

        rootIndex = 0;
        leafCount = 0;

        roots[0] = IHushFactory(msg.sender).emptyTree();
        treesize = 2**IHushFactory(msg.sender).treeDepth();
    }

    /**
     * @dev processes the deposit, i.e., pulling funds from caller.
     * @param _deposits The number of deposits
     */
    function _processDeposit(uint8 _deposits) internal virtual;

    /**
     * @dev Processes the withdraw, i.e., transferring funds to the receiver and caller.
     * Has to ensure that the correct amount is trasnferred, e.g., that full amount is = depositAmount
     * @param _receiver The receiver of funds
     * @param _fee The fee that goes to the caller.
     */
    function _processWithdraw(address _receiver, uint256 _fee) internal virtual;

    /**
     * @dev isValidDeposit will check the provided single deposit proof, and continue only if the proof is valid. Reverts otherwise.
     * @param _proof The a, b, c points of the SNARK (Groth16) proof packed as an array.
     * @param _publicSignals The public inputs for the proof, [newRoot, oldRoot, index, commitment]
     */
    modifier isValidDeposit(
        uint256[8] memory _proof,
        uint256[4] memory _publicSignals
    ) {
        require(
            roots[rootIndex] == _publicSignals[1],
            "HushPool: oldroot not matching"
        );
        require(leafCount == _publicSignals[2], "HushPool: index not matching");
        require(leafCount <= treesize - 1, "HushPool: tree is full");

        require(
            areAllValidFieldElements(_proof),
            "HushPool: proof contains invalid elements"
        );

        // At the verify call we are checking that all signals are valid field elements

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) =
            unpackProof(_proof);

        require(
            IVerifier(IHushFactory(factory).depositVerifier()).verifyProof(
                a,
                b,
                c,
                _publicSignals
            ),
            "HushPool: invalid proof"
        );

        _;
    }

    /**
     * @dev isValidMultiDeposit will check the provided multi deposit proof, and continue only if the proof is valid. Reverts otherwise.
     * @param _proof The a, b, c points of the SNARK (Groth16) proof packed as an array.
     * @param _publicSignals The public inputs for the proof, [newRoot, oldRoot, startIndex, commitments...]
     */

    modifier isValidMultiDeposit(
        uint256[8] memory _proof,
        uint256[11] memory _publicSignals
    ) {
        require(
            roots[rootIndex] == _publicSignals[1],
            "HushPool: oldroot not matching"
        );
        require(leafCount == _publicSignals[2], "HushPool: index not matching");
        require(leafCount <= treesize - 8, "HushPool: tree is full");

        require(
            areAllValidFieldElements(_proof),
            "HushPool: proof contains invalid elements"
        );

        // At the verify call we are checking that all signals are valid field elements

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) =
            unpackProof(_proof);

        require(
            IVerifier(IHushFactory(factory).multiDepositVerifier()).verifyProof(
                a,
                b,
                c,
                _publicSignals
            ),
            "HushPool: invalid proof"
        );

        _;
    }

    /**
     * @dev isValidWithdraw will check the provided withdraw proof, and continue only if the proof is valid. Reverts otherwise.
     * @param _proof The a, b, c points of the SNARK (Groth16) proof packed as an array.
     * @param _publicSignals The public inputs for the proof, [nullifier, root, receiver, fee]
     */
    modifier isValidWithdraw(
        uint256[8] memory _proof,
        uint256[4] memory _publicSignals
    ) {
        require(isKnownRoot(_publicSignals[1]), "HushPool: root not known");
        require(!nullifiers[_publicSignals[0]], "HushPool: nullifier reuse");

        require(
            areAllValidFieldElements(_proof),
            "HushPool: proof contains invalid elements"
        );

        // Ath the verify call we are checking that all signals are valid field elements

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) =
            unpackProof(_proof);

        require(
            IVerifier(IHushFactory(factory).withdrawVerifier()).verifyProof(
                a,
                b,
                c,
                _publicSignals
            ),
            "HushPool: invalid proof"
        );

        _;
    }

    // State changing functions

    /**
     * @dev deposit will add a commitment to the state and update state root if given a valid proof, revert otherwise.
     * @param proof The SNARK proof
     * @param input the input signals
     * @return true if successful, false otherwise
     */
    function deposit(uint256[8] memory proof, uint256[4] memory input)
        public
        override
        isValidDeposit(proof, input)
        returns (bool)
    {
        emit Deposit(input[3], leafCount++);
        rootIndex = (rootIndex + 1) % ROOT_HISTORY_SIZE;
        roots[rootIndex] = input[0];
        _processDeposit(1);
        return true;
    }

    /**
     * @dev multiDeposit will add multiple commitments to the state and update state root if given a valid proof, revert otherwise.
     * @param proof The SNARK proof
     * @param input the input signals
     * @return true if successful, false otherwise
     */
    function multiDeposit(uint256[8] memory proof, uint256[11] memory input)
        public
        override
        isValidMultiDeposit(proof, input)
        returns (bool)
    {
        uint8 deposits = 0;
        bool addedZeroLeaf = false;

        for (uint8 i = 3; i < 11; i++) {
            if (ZEROLEAF == input[i]) {
                addedZeroLeaf = true;
            } else {
                require(!addedZeroLeaf, "HushPool: non-zero after zeroleaf");
                emit Deposit(input[i], leafCount++);
                deposits++;
            }
        }

        // Update the roots with new root.
        rootIndex = (rootIndex + 1) % ROOT_HISTORY_SIZE;
        roots[rootIndex] = input[0];

        _processDeposit(deposits);
        return true;
    }

    /**
     * @dev Withdraw will spend a note in the state, transferring some fee to the caller and rest to the receiver. Successful if given a valid proof, revert otherwise.
     * @param proof The SNARK proof
     * @param input the input signals
     * @return true if successful, false otherwise
     */

    function withdraw(uint256[8] memory proof, uint256[4] memory input)
        public
        override
        isValidWithdraw(proof, input)
        returns (bool)
    {
        nullifiers[input[0]] = true;

        // Compute amount
        address receiver = address(input[2]);

        emit Withdraw(input[0], receiver, input[3]);
        _processWithdraw(receiver, input[3]);
        return true;
    }

    function isKnownRoot(uint256 _root) public view override returns (bool) {
        if (_root == 0) {
            return false;
        }
        uint32 i = rootIndex;
        do {
            if (_root == roots[i]) {
                return true;
            }
            if (i == 0) {
                i = ROOT_HISTORY_SIZE;
            }
            i--;
        } while (i != rootIndex);
        return false;
    }

    function getLastRoot() public view override returns (uint256) {
        return roots[rootIndex];
    }
}
