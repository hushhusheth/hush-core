//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IHushPool} from "./../Interfaces/IHushPool.sol";
import {IERCHushPool} from "./../Interfaces/IERCHushPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWAToken} from "./../Tokens/WAToken.sol";
import {ProofUtil} from "./../ProofUtil.sol";

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract AZap is ProofUtil {
    using SafeERC20 for IERC20;

    uint256 public constant ZEROLEAF =
        uint256(keccak256(abi.encodePacked("HushHush"))) % SNARK_SCALAR_FIELD;

    constructor() public {}

    function multiDeposit(
        address _pool,
        uint256[8] memory _proof,
        uint256[11] memory _input
    ) public {
        uint8 _deposits = _depositCount(_input);
        _deposit(_pool, _deposits);
        // Into the pool
        IHushPool(_pool).multiDeposit(_proof, _input);
    }

    function deposit(
        address _pool,
        uint256[8] memory _proof,
        uint256[4] memory _input
    ) public {
        _deposit(_pool, 1);
        IHushPool(_pool).deposit(_proof, _input);
    }

    function _depositCount(uint256[11] memory _signals)
        internal
        pure
        returns (uint8)
    {
        uint8 deposits = 0;
        bool addedZeroLeaf = false;
        for (uint8 i = 3; i < 11; i++) {
            if (ZEROLEAF == _signals[i]) {
                addedZeroLeaf = true;
            } else {
                require(!addedZeroLeaf, "AZap: non-zero after zeroleaf");
                deposits++;
            }
        }
        return deposits;
    }

    function _deposit(address _pool, uint8 _deposits) internal {
        address _waToken = address(IERCHushPool(_pool).token());
        IERC20 _aToken = IWAToken(_waToken).aToken();

        uint256 depositAmount = IERCHushPool(_pool).depositAmount();

        uint256 aTokenAmount =
            IWAToken(_waToken).toAtokens(depositAmount * _deposits);

        _aToken.safeTransferFrom(msg.sender, address(this), aTokenAmount);

        // Approve tokens
        _aToken.safeApprove(_waToken, aTokenAmount);

        // WRAP IT!
        IWAToken(_waToken).deposit(aTokenAmount);

        // Approve pool
        IERC20(_waToken).safeApprove(address(_pool), _deposits * depositAmount);
    }
}
