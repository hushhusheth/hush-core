import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { deploy, execute, log, read } = deployments;
    const { deployer, hushhardware1, proposer1, proposer2, executor1, executor2 } = await getNamedAccounts();

    const controller = await deployments.getOrNull("Controller");

    if (controller) {
        log(`reusing controller at ${controller.address}`);
    } else {
        let delay = ethers.BigNumber.from(60).mul(60).mul(24).mul(2); // 2 days or 60*60*24*2 seconds
        let proposers = [proposer1, proposer2];
        let executors = [executor1, executor2];

        await deploy('Controller', {
            contract: 'TimelockController',
            from: deployer,
            log: true,
            args: [delay, proposers, executors],
        });

        // Add hushhardware as admin
        let TIMELOCK_ADMIN_ROLE = await read("Controller", "TIMELOCK_ADMIN_ROLE");
        await execute("Controller",
            { from: deployer },
            "grantRole",
            TIMELOCK_ADMIN_ROLE,
            hushhardware1
        )
        let hasRole = await read("Controller", "hasRole", TIMELOCK_ADMIN_ROLE, hushhardware1);
        log(`Hush hardware at ${hushhardware1} added as timelock admin: ${hasRole}`);
    }
};

export default func;
func.dependencies = [];
func.tags = ['Controller'];