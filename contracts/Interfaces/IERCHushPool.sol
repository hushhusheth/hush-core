//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERCHushPool {
    event CollectedFees(address _collector, uint256 _collected);

    function initialize(address _token, uint256 _depositAmount) external;

    function depositAmount() external view returns (uint256);

    function token() external view returns (IERC20);

    function collectFees() external;
}
