//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {HushPool} from "./HushPool.sol";
import {IERCHushPool} from "./Interfaces/IERCHushPool.sol";
import {IHushFactory} from "./Interfaces/IHushFactory.sol";

contract ERCHushPool is HushPool, IERCHushPool {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public override depositAmount;
    IERC20 public override token;

    uint256 public collectedFees;

    event CollectedFees(address _collector, uint256 _collected);

    function initialize(address _token, uint256 _depositAmount)
        public
        override
    {
        super.initialize();
        token = IERC20(_token);
        depositAmount = _depositAmount;
    }

    function _processDeposit(uint8 _deposits) internal override {
        token.safeTransferFrom(
            msg.sender,
            address(this),
            depositAmount * _deposits
        );
    }

    function _processWithdraw(address _receiver, uint256 _fee)
        internal
        override
    {
        uint256 withdrawAmount = _withdrawAmount(_fee);
        token.safeTransfer(msg.sender, _fee);
        token.safeTransfer(_receiver, withdrawAmount);
    }

    function _withdrawAmount(uint256 _fee) internal returns (uint256 amount) {
        amount = depositAmount.sub(_fee);
        uint256 feesize = IHushFactory(factory).feeSize();
        if (feesize > 0) {
            uint256 protocolFee = depositAmount.mul(feesize).div(10000);
            amount = amount.sub(protocolFee);
            collectedFees = collectedFees.add(protocolFee);
        }
    }

    function collectFees() external override {
        require(
            msg.sender == IHushFactory(factory).feeCollector(),
            "ERCHushPool: Not fee collector"
        );
        emit CollectedFees(msg.sender, collectedFees);
        token.safeTransfer(msg.sender, collectedFees);
        collectedFees = 0;
    }
}
