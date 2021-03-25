//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IHushPool {
    event Deposit(uint256 _commitment, uint256 _index);
    event Withdraw(uint256 _nullifier, address _receiver, uint256 _fee);

    function leafCount() external view returns (uint256);

    function treesize() external view returns (uint256);

    function ZEROLEAF() external view returns (uint256);

    function nullifiers(uint256) external view returns (bool);

    function factory() external view returns(address);

    function multiDeposit(uint256[8] memory proof, uint256[11] memory input)
        external
        returns (bool);

    function deposit(uint256[8] memory proof, uint256[4] memory input)
        external
        returns (bool);

    function withdraw(uint256[8] memory proof, uint256[4] memory input)
        external
        returns (bool);

    function initialize() external;

    function isKnownRoot(uint256 _root) external view returns (bool);

    function getLastRoot() external view returns (uint256);
}
