//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {ERC20Permit} from "./ERC20Permit.sol";

contract ERC20Tester is ERC20Permit {
    constructor(uint256 initialSupply) public ERC20Permit("Test", "TST"){
        _mint(msg.sender, initialSupply);
    }
}
