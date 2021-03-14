import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { deploy, execute, log } = deployments;
    const { deployer } = await getNamedAccounts();

    const zapper = await deployments.getOrNull("AZap");

    if (zapper) {
        log(`reusing zapper at ${zapper.address}`);
    } else {
        await deploy('AZap', {
            contract: 'AZap',
            from: deployer,
            log: true,
            args: [],
        });
    }
};

export default func;
func.dependencies = [];
func.tags = ['AZap'];