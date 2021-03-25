//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILendingPool} from "./../aave/interfaces/ILendingPool.sol";

interface IWAToken is IERC20 {
    function lendingPool() external view returns (ILendingPool);

    function underlyingAsset() external view returns (address);

    function aToken() external view returns (IERC20);

    function toAtokens(uint256 _scaledATokens) external view returns (uint256);

    function toScaledTokens(uint256 _aTokens) external view returns(uint256);

    function getRatio() external view returns(uint256);

    function deposit(uint256 _aTokenAmount) external;

    function depositTo(address _to, uint256 _aTokenAmount) external;

    function withdraw(uint256 _scaledAmount) external;

    function withdrawTo(address _to, uint256 _scaledAmount) external;

    function withdrawFrom(
        address _from,
        address _to,
        uint256 _scaledAmount
    ) external;
}
