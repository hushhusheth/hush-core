import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { ADDRESSES } from "../utils/addresses";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { getNamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";

const fromToken = (bal: string, decimals = 18) => ethers.utils.parseUnits(bal, decimals);
const toToken = (bal: string, decimals = 18) => ethers.utils.formatUnits(bal, decimals);


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, ethers, getNamedAccounts } = hre;
	const { execute, read, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const { deployer: deployerSigner } = await getNamedSigners(hre);

	type Pool = { tokenAddress: string; depositAmount: BigNumber };
	let pools: Pool[] = [
		{
			tokenAddress: ADDRESSES["ceth"],
			depositAmount: fromToken("50", 8),
		},
		{
			tokenAddress: ADDRESSES["ceth"],
			depositAmount: fromToken("500", 8),
		},
	];

	//TODO: The below is used to fund a tester account for the GUI
	let blockNumber = await deployerSigner.provider.getBlockNumber();
    console.log(`Block number before funding: ${blockNumber}`);

	//TODO: Funding CEth
	log(`Funding 🦍-user`);
	const ceth = await ethers.getContractAt("CEther", ADDRESSES["ceth"]);
	const fundingAmount = fromToken("500", 18);

	await ceth.connect(deployerSigner).mint({ value: fundingAmount });
	let cethBalance = await ceth.balanceOf(deployer);

	let monkey = "0xD81523Da11b9A55cB1b39f08bd59319E5143A910";
	await ceth.connect(deployerSigner).transfer(monkey, cethBalance);
	log(`🦍 ceth balance: ${toToken(await ceth.balanceOf(monkey), 8)}`);

	const lendingPool = await ethers.getContractAt("ILendingPool", ADDRESSES["lendingpool"]);
	const weth = await ethers.getContractAt("IWETH", ADDRESSES["weth"]);
	const wethERC20 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES["weth"]);
	const aWeth = await ethers.getContractAt("AToken", ADDRESSES["aweth"]);

	await weth.connect(deployerSigner).deposit({ value: fundingAmount });
	await wethERC20.connect(deployerSigner).approve(lendingPool.address, fundingAmount);
	await lendingPool.connect(deployerSigner).deposit(weth.address, fundingAmount, deployer, 0);
	const aWethBalance = await aWeth.balanceOf(deployer);
	await aWeth.connect(deployerSigner).transfer(monkey, aWethBalance);

	log(`🦍 aWeth balance: ${toToken(await aWeth.balanceOf(monkey), 18)}`);
};
export default func;
func.dependencies = ["MorePools"];
func.tags = ["FundTester"];
