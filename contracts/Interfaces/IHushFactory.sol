//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IHushFactory {
    event CreatedPool(address _token, uint256 _depositAmount, address _pool);
    event RetirePool(address _token, uint256 _depositAmount, address _pool);
    event UpdatedFeeSize(uint256 _feeSize);
    event UpdatedFeeCollector(address _collector);
    event ProposeUpdateVerifier(
        address depositVerifier,
        address multiDepositVerifier,
        address withdrawVerifier
    );
    event UpdatedVerifiers(
        address depositVerifier,
        address multiDepositVerifier,
        address withdrawVerifier
    );

    function genesis(address _token, uint256 _depositAmount)
        external
        returns (address pool);

    function setFeeSize(uint256 _feeSize) external;

    function setFeeCollector(address _collector) external;

    function ossify() external;

    function queueVerifierUpdate(
        address _depositVerifier,
        address _multiDepositVerifier,
        address _withdrawVerifier
    ) external;

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

    function proposedDepositVerifier() external returns (address);

    function multiDepositVerifier() external returns (address);

    function proposedMultiDepositVerifier() external returns (address);

    function withdrawVerifier() external returns (address);

    function proposedWithdrawVerifier() external returns (address);

    function feeSize() external returns (uint256);

    function feeCollector() external returns (address);

    function proposalInit() external returns (uint256);

    function updateDelay() external returns (uint256);

    function gracePeriod() external returns (uint256);
}
