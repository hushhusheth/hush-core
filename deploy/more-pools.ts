import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { toFixedHex } from '../zkproofs/src/utils';
import { expect } from "chai";

import { ADDRESSES } from "../utils/addresses";
import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { execute, read, log } = deployments;
    const { deployer } = await getNamedAccounts();

    type Pool = { tokenAddress: string, depositAmount: BigNumber };
    let pools: Pool[] = [
        {
            tokenAddress: ADDRESSES["ceth"],
            depositAmount: fromToken("50", 8)
        },
        {
            tokenAddress: ADDRESSES["ceth"],
            depositAmount: fromToken("500", 8)
        }
    ];

    for (let i = 0; i < pools.length; i++) {
        let pool = pools[i];
        let expectedPoolAddress = await read("PoolFactory", "getERCPool", pool.tokenAddress, pool.depositAmount);
        if (expectedPoolAddress == toFixedHex(0, 20)) {
            await execute("PoolFactory",
                { from: deployer },
                "deployERCPool",
                pool.tokenAddress,
                pool.depositAmount
            );
            expectedPoolAddress = await read(
                "PoolFactory",
                "getERCPool",
                pool.tokenAddress,
                pool.depositAmount
            );
            expect(expectedPoolAddress).to.not.equal(toFixedHex(0, 20));
            log(`Pool for ${pool.tokenAddress} with ${pool.depositAmount} created at ${expectedPoolAddress}`);
        } else {
            log(`Pool for ${pool.tokenAddress} with ${pool.depositAmount} already exist at ${expectedPoolAddress}`);
        }
    }

};
export default func;
func.dependencies = ["Setup"];
func.tags = ['MorePools'];