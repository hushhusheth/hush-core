import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { toFixedHex, zero_value } from '../zkproofs/src/utils';
import { expect } from "chai";

import { ADDRESSES } from "./../utils/addresses";
import { ethers } from 'hardhat';
import { getNamedSigners } from 'hardhat-deploy-ethers/dist/src/helpers';

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { execute, read, log } = deployments;
    const { deployer, user } = await getNamedAccounts();

    const { deployer: deployerSigner } = await getNamedSigners(hre);

    // Just temp
    //deployerSigner.sendTransaction;
    await deployerSigner.sendTransaction({to: "0xD81523Da11b9A55cB1b39f08bd59319E5143A910", value: fromToken("100")});

    let depositAmount = fromToken("1", 18);

    // Wrapped token genesis
    // Setup token genesis
    let aWethAddress = ADDRESSES["aweth"];

    let genesisTokenAddress = await read(
        "TokenFactory",
        "watokens",
        aWethAddress
    );

    if (genesisTokenAddress == toFixedHex(0, 20)) {
        let name = "Wrapped aWeth";
        let symbol = "WaWeth";
        let tokenAddress = ADDRESSES["weth"];

        await execute("TokenFactory",
            { from: deployer },
            "genesis",
            name, symbol, tokenAddress, aWethAddress
        );

        genesisTokenAddress = await read("TokenFactory", "watokens", aWethAddress);
        expect(genesisTokenAddress).to.not.equal(toFixedHex(0, 20));
        log(`Wrapped aWeth deployed to: ${genesisTokenAddress}`);
    } else {
        log(`Wrapped aWeth exists at: ${genesisTokenAddress}`);
    }

    // Pool genesis
    let genesisPoolAddress = await read("PoolFactory", "getERCPool", genesisTokenAddress, depositAmount);

    if (genesisPoolAddress == toFixedHex(0, 20)) {
        await execute("PoolFactory",
            { from: deployer },
            "genesis",
            genesisTokenAddress,
            depositAmount
        );

        genesisPoolAddress = await read("PoolFactory", "getERCPool", genesisTokenAddress, depositAmount);
        expect(genesisPoolAddress).to.not.equal(toFixedHex(0, 20));
        log(`WaWeth Pool deployed to: ${genesisPoolAddress}`);
    } else {
        log(`WaWeth Pool exists at: ${genesisPoolAddress}`);
    }

};
export default func;
func.dependencies = ["TokenFactory", "PoolFactory"];
func.tags = ['Setup'];