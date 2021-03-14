//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IHushFactory {
    function genesis(address _token, uint256 _depositAmount)
        external
        returns (address pool);

    function setFeeSize(uint256 _feeSize) external;

    function setFeeCollector(address _collector) external;

    function ossify() external;

    function setVerifiers(
        address _depositVerifier,
        address _multiDepositVerifier,
        address _withdrawVerifier
    ) external;

    function deployERCPool(address _token, uint256 _depositAmount)
        external
        returns (address pool);

    function getERCPool(address _token, uint256 _depositAmount)
        external
        view
        returns (address);

    function retirePool(address _token, uint256 _depositAmount) external;

    function emptyTree() external returns (uint256);

    function treeDepth() external returns (uint256);

    function depositVerifier() external returns (address);

    function multiDepositVerifier() external returns (address);

    function withdrawVerifier() external returns (address);

    function feeSize() external returns (uint256);

    function feeCollector() external returns (address);
}
