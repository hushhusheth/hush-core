//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {ILendingPool} from "./../aave/interfaces/ILendingPool.sol";
import {WadRayMath} from "./../aave/protocol/libraries/math/WadRayMath.sol";

import {IWAToken} from "./../Interfaces/IWAToken.sol";

contract WAToken is IWAToken, Context {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using WadRayMath for uint256;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    ILendingPool public override lendingPool;
    address public override underlyingAsset;
    IERC20 public override aToken;

    bool isInitialised;

    constructor() public {}

    function initialize(
        string memory _name,
        string memory _symbol,
        address _asset,
        address _lendingPool,
        address _aToken
    ) public {
        require(!isInitialised, "WAToken: Already initialized");
        isInitialised = true;
        name = _name;
        symbol = _symbol;
        underlyingAsset = _asset;
        lendingPool = ILendingPool(_lendingPool);
        aToken = IERC20(_aToken);
    }

    function deposit(uint256 _aTokenAmount) public override {
        aToken.safeTransferFrom(_msgSender(), address(this), _aTokenAmount);
        uint256 amountScaled = toScaledTokens(_aTokenAmount);
        _mint(_msgSender(), amountScaled);
    }

    function depositTo(address _to, uint256 _aTokenAmount) public override {
        aToken.safeTransferFrom(_msgSender(), address(this), _aTokenAmount);
        uint256 amountScaled = toScaledTokens(_aTokenAmount);
        _mint(_to, amountScaled);
    }

    function withdraw(uint256 _scaledAmount) public override {
        _burn(_msgSender(), _scaledAmount);
        uint256 aTokenAmount = toAtokens(_scaledAmount);
        aToken.safeTransfer(_msgSender(), aTokenAmount);
    }

    function withdrawTo(address _to, uint256 _scaledAmount) public override {
        _burn(_msgSender(), _scaledAmount);
        uint256 aTokenAmount = toAtokens(_scaledAmount);
        aToken.safeTransfer(_to, aTokenAmount);
    }

    function withdrawFrom(
        address _from,
        address _to,
        uint256 _scaledAmount
    ) public override {
        _burn(_from, _scaledAmount);
        uint256 aTokenAmount = toAtokens(_scaledAmount);
        aToken.safeTransfer(_to, aTokenAmount);

        _approve(
            _from,
            _msgSender(),
            allowance[_from][_msgSender()].sub(
                _scaledAmount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
    }

    // Standard stuff
    function approve(address spender, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            _msgSender(),
            allowance[sender][_msgSender()].sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    // Implementations

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        totalSupply = totalSupply.add(amount);
        balanceOf[account] = balanceOf[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        balanceOf[account] = balanceOf[account].sub(
            amount,
            "ERC20: burn amount exceeds balance"
        );
        totalSupply = totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        balanceOf[sender] = balanceOf[sender].sub(
            amount,
            "ERC20: transfer amount exceeds balance"
        );
        balanceOf[recipient] = balanceOf[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    // Views
    function balanceATokens(address _user) public view returns (uint256) {
        return toAtokens(balanceOf[_user]);
    }

    /**
     * @notice Computes the current aToken balance for `_scaledATokens` scaled aTokens
     * @param _scaledATokens The amount of scaled aTokens
     * @return The current aToken balance
     */
    function toAtokens(uint256 _scaledATokens)
        public
        view
        override
        returns (uint256)
    {
        return
            _scaledATokens.rayMul(
                lendingPool.getReserveNormalizedIncome(underlyingAsset)
            );
    }

    /**
     * @notice Computes the number of scaled aTokens that one have with a given aTokens amount.
     * @param _aTokens The aMount of aTokens
     * @return The current number of scaled aTokens
     */
    function toScaledTokens(uint256 _aTokens) public view returns (uint256) {
        return
            _aTokens.rayDiv(
                lendingPool.getReserveNormalizedIncome(underlyingAsset)
            );
    }
}
