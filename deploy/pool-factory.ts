import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MerkleTree } from '../zkproofs/src/merkletree';
import { zero_value } from '../zkproofs/src/utils';

let depth = 20;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { deploy, execute, log } = deployments;
    const { deployer, user } = await getNamedAccounts();

    const singleDepositVerifier = await deployments.get("SingleDepositVerifier");
    const multiDepositVerifier = await deployments.get("MultiDepositVerifier");
    const withdrawVerifier = await deployments.get("WithdrawVerifier");

    const poolFactory = await deployments.getOrNull("PoolFactory");

    if (poolFactory) {
        log(`reusing pool factory at ${poolFactory.address}`);
    } else {

        let emptyTree = new MerkleTree(depth, zero_value);
        emptyTree.init();

        await deploy('PoolFactory', {
            contract: 'HushFactory',
            from: deployer,
            log: true,
            args: [emptyTree.root.toString(), emptyTree.depth],
        });

        await execute("PoolFactory",
            { from: deployer },
            "setVerifiers",
            singleDepositVerifier.address,
            multiDepositVerifier.address,
            withdrawVerifier.address,
        );

        await execute("PoolFactory",
            { from: deployer },
            "setFeeSize",
            50
        );
    }

};
export default func;
func.dependencies = ["Verifiers", "TokenFactory"];
func.tags = ['PoolFactory'];