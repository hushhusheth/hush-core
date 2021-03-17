//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {IERCHushPool} from "./IERCHushPool.sol";
import {IHushPool} from "./IHushPool.sol";

interface IHush is IERCHushPool, IHushPool{
}
