import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MerkleTree } from '../zkproofs/src/merkletree';
import { zero_value } from '../zkproofs/src/utils';
import { expect } from "chai";

import { ADDRESSES } from "./../utils/addresses";


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { deploy, execute, log } = deployments;
    const { deployer, user } = await getNamedAccounts();

    const tokenFactory = await deployments.getOrNull("TokenFactory");

    if (tokenFactory) {
        log(`reusing token factory at ${tokenFactory.address}`);
    } else {
        let res = await deploy('TokenFactory', {
            contract: 'WATokenFactory',
            from: deployer,
            log: true,
            args: [ADDRESSES["lendingpool"]],
        });


        // Need to ensure it is updated 
    }

};
export default func;
func.dependencies = [];
func.tags = ['TokenFactory'];