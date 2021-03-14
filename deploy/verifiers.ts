import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    const singleDepositVerifier = await deployments.getOrNull("SingleDepositVerifier");
    if (singleDepositVerifier) {
        log(`reusing single deposit verifier at ${singleDepositVerifier.address}`);
    } else {
        await deploy('SingleDepositVerifier', {
            contract: 'zkproofs/build/sol/SingleDepositVerifier.sol:Verifier',
            from: deployer,
            log: true,
        });
    }

    const multiDepositVerifier = await deployments.getOrNull("MultiDepositVerifier");
    if (multiDepositVerifier) {
        log(`reusing multi deposit verifier at ${multiDepositVerifier.address}`);
    } else {
        await deploy('MultiDepositVerifier', {
            contract: 'zkproofs/build/sol/MultiDepositVerifier.sol:Verifier',
            from: deployer,
            log: true,
        });
    }

    const withdrawVerifier = await deployments.getOrNull("WithdrawVerifier");
    if (withdrawVerifier) {
        log(`reusing withdraw verifier at ${withdrawVerifier.address}`);
    } else {
        await deploy('WithdrawVerifier', {
            contract: 'zkproofs/build/sol/WithdrawVerifier.sol:Verifier',
            from: deployer,
            log: true,
        });
    }

};
export default func;
func.tags = ['Verifiers'];