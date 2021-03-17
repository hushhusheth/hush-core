//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ERCHushPool} from "./ERCHushPool.sol";
import {IERCHushPool} from "./Interfaces/IERCHushPool.sol";
import {IHushFactory} from "./Interfaces/IHushFactory.sol";

contract HushFactory is Ownable, IHushFactory {
    using Clones for address;

    uint256 public immutable override emptyTree;
    uint256 public immutable override treeDepth;

    uint256 public override feeSize;
    address public override feeCollector;

    uint256 public constant override updateDelay = 7 days;
    uint256 public constant override gracePeriod = 1 days;
    uint256 public override proposalInit;

    address public override proposedDepositVerifier;
    address public override proposedMultiDepositVerifier; 
    address public override proposedWithdrawVerifier;

    address public override depositVerifier;
    address public override multiDepositVerifier;
    address public override withdrawVerifier;

    address public genesisPool;

    bool public ossified = false;

    mapping(address => mapping(uint256 => address)) erc20Pools;

    constructor(uint256 _emptyTree, uint256 _treeDepth) public {
        emptyTree = _emptyTree;
        require(_treeDepth < 32, "Factory: tree depth must be below 32");
        treeDepth = _treeDepth;
        feeCollector = address(0);
        feeSize = 0;
    }

    modifier definedVerifiers() {
        require(
            depositVerifier != address(0),
            "Factory: undefined deposit verifier"
        );
        require(
            multiDepositVerifier != address(0),
            "Factory: undefined multideposit verifier"
        );
        require(
            withdrawVerifier != address(0),
            "Factory: undefined withdraw verifier"
        );

        _;
    }

    function setFeeSize(uint256 _feeSize) public override onlyOwner() {
        require(_feeSize <= 100, "Factory: fee is above 100 basis points");
        feeSize = _feeSize;
        emit UpdatedFeeSize(feeSize);
    }

    function setFeeCollector(address _collector) public override onlyOwner() {
        feeCollector = _collector;
        emit UpdatedFeeCollector(_collector);
    }

    function ossify() public override onlyOwner() definedVerifiers() {
        require(!ossified, "Factory: already ossified");
        ossified = true;
    }

    function queueVerifierUpdate(
        address _depositVerifier,
        address _multiDepositVerifier,
        address _withdrawVerifier
    ) public override onlyOwner() definedVerifiers() {
        require(!ossified, "Factory: verifiers ossified");
        proposalInit = now;
        proposedDepositVerifier = _depositVerifier;
        proposedMultiDepositVerifier = _multiDepositVerifier;
        proposedWithdrawVerifier = _withdrawVerifier;
        emit ProposeUpdateVerifier(
            proposedDepositVerifier,
            proposedMultiDepositVerifier,
            proposedWithdrawVerifier
        );
    }

    function setVerifiers(
        address _depositVerifier,
        address _multiDepositVerifier,
        address _withdrawVerifier
    ) public override onlyOwner() {
        require(!ossified, "Factory: verifiers ossified");
        bool isInitial =
            depositVerifier == address(0) &&
                multiDepositVerifier == address(0) &&
                withdrawVerifier == address(0);
        bool matchesQueued =
            _depositVerifier == proposedWithdrawVerifier &&
                _multiDepositVerifier == proposedMultiDepositVerifier &&
                _withdrawVerifier == proposedWithdrawVerifier;
        bool satisfiesTime =
            (now > proposalInit + updateDelay) &&
                (now < proposalInit + updateDelay + gracePeriod);
        require(
            isInitial || (matchesQueued && satisfiesTime),
            "Factory: verifiers not matching criterias"
        );
        depositVerifier = _depositVerifier;
        multiDepositVerifier = _multiDepositVerifier;
        withdrawVerifier = _withdrawVerifier;
        emit UpdatedVerifiers(
            depositVerifier,
            multiDepositVerifier,
            withdrawVerifier
        );
    }

    function genesis(address _token, uint256 _depositAmount)
        public
        override
        definedVerifiers()
        onlyOwner()
        returns (address pool)
    {
        require(genesisPool == address(0), "Factory: genesis already defined");
        bytes memory bytecode = type(ERCHushPool).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(_token, _depositAmount));
        require(
            erc20Pools[_token][_depositAmount] == address(0),
            "Factory: pool already exists"
        );
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IERCHushPool(pool).initialize(_token, _depositAmount);
        genesisPool = pool;
        erc20Pools[_token][_depositAmount] = pool;
        emit CreatedPool(_token, _depositAmount, pool);
    }

    function deployERCPool(address _token, uint256 _depositAmount)
        public
        override
        definedVerifiers()
        onlyOwner()
        returns (address pool)
    {
        require(genesisPool != address(0), "Factory: genesis not defined");
        require(
            erc20Pools[_token][_depositAmount] == address(0),
            "Factory: pool already exists"
        );
        pool = genesisPool.clone();
        IERCHushPool(pool).initialize(_token, _depositAmount);
        erc20Pools[_token][_depositAmount] = pool;
        emit CreatedPool(_token, _depositAmount, pool);
    }

    function getERCPool(address _token, uint256 _depositAmount)
        public
        view
        override
        returns (address)
    {
        return erc20Pools[_token][_depositAmount];
    }

    function retirePool(address _token, uint256 _depositAmount)
        public
        override
        onlyOwner()
    {
        emit RetirePool(
            _token,
            _depositAmount,
            erc20Pools[_token][_depositAmount]
        );
        delete erc20Pools[_token][_depositAmount];
    }
}
