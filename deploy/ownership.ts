import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { ADDRESSES } from "./../utils/addresses";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts } = hre;
    const { execute, read, log } = deployments;
    const { deployer, hushhardware1 } = await getNamedAccounts();

    const controller = await deployments.get("Controller");
    const poolFactory = await deployments.get("PoolFactory");
    const tokenFactory = await deployments.get("TokenFactory");

    let TIMELOCK_ADMIN_ROLE = await read("Controller", "TIMELOCK_ADMIN_ROLE");
    let hasRole = await read("Controller", "hasRole", TIMELOCK_ADMIN_ROLE, hushhardware1);
    if (!hasRole) {
        return;
    }

    let poolOwner = await read(
        "PoolFactory",
        "owner"
    );

    if (poolOwner == controller.address) {
        log(`Controller already owns pool factory at ${poolFactory.address}`);
    } else {
        await execute("PoolFactory",
            { from: deployer },
            "transferOwnership",
            controller.address
        );
        log(`Controller now owns pool factory at ${poolFactory.address}`);
    }

    let tokenOwner = await read(
        "TokenFactory",
        "owner"
    );

    if (tokenOwner == controller.address) {
        log(`Controller already owns token factory at ${tokenFactory.address}`);
    } else {
        await execute("TokenFactory",
            { from: deployer },
            "transferOwnership",
            controller.address
        );
        log(`Controller now owns token factory at ${tokenFactory.address}`);
    }
};
export default func;
func.dependencies = ["Setup", "Controller", "MorePools", "MoreTokens"];
func.tags = ['Ownership'];