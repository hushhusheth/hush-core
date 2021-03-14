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

    type Token = { name: string, symbol: string, tokenAddress: string, aTokenAddress: string };
    let tokens: Token[] = [
    ];

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        let expectedTokenAddress = await read("TokenFactory", "watokens", token.aTokenAddress);
        if (expectedTokenAddress == toFixedHex(0, 20)) {
            await execute("TokenFactory",
                { from: deployer },
                "deployWAToken",
                token.name,
                token.symbol,
                token.tokenAddress,
                token.aTokenAddress
            );

            expectedTokenAddress = await read("TokenFactory", "watokens", token.aTokenAddress);

            log(`Wrapped aToken for ${token.aTokenAddress} already created at ${expectedTokenAddress}`);
        } else {
            log(`Wrapped aToken for ${token.aTokenAddress} already exist at ${expectedTokenAddress}`);
        }
    }

};
export default func;
func.dependencies = ["Setup"];
func.tags = ['MoreTokens'];