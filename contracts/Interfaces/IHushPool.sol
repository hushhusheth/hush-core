//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IHushPool {
    function leafCount() external returns (uint256);

    function treesize() external returns (uint256);

    function ZEROLEAF() external view returns (uint256);

    function nullifiers(uint256) external returns (bool);

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
