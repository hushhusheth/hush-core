import { task } from "hardhat/config"
import "@nomiclabs/hardhat-waffle";
//import * as Config from "./config";
import "hardhat-gas-reporter";
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';

import { HardhatUserConfig } from "hardhat/config";

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNamedSigners } from "hardhat-deploy-ethers/dist/src/helpers";


require("dotenv").config();

const toBool = (a: string) => a == "true" ? true : false

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
	const accounts = await hre.ethers.getSigners();
	for (const account of accounts) {
		console.log(account.address, hre.ethers.utils.formatEther(await account.getBalance()));
	}
});

task("status", "Prints address and balance of deployer", async (args, hre: HardhatRuntimeEnvironment) => {
	let { deployer} = await getNamedSigners(hre);
	console.log(`Deployer at ${deployer.address} has balance of: ${hre.ethers.utils.formatEther(await deployer.getBalance())}`);

});

let mnemonic = process.env.MNEMONIC ? process.env.MNEMONIC : 'test test test test test test test test test test test junk';
const custom_accounts = {
	mnemonic,
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
	gasReporter: {
		enabled: toBool(process.env.GASREPORTER_ENABLED),
		coinmarketcap: process.env.COINMARKETCAP,
		currency: 'USD',
		gasPrice: 100
	},
	solidity: {
		compilers: [
			{
				version: "0.7.4",
				settings: {
					optimizer: {
						enabled: true,
						runs: 1000
					}
				}
			},
			{
				version: "0.6.12",
				settings: {
					optimizer: {
						enabled: true,
						runs: 1000
					}
				}
			},
			{
				version: "0.5.16",
				settings: {
					optimizer: {
						enabled: true,
						runs: 1000
					}
				}
			},
		]
	},
	networks: {
		hardhat: {
			accounts: custom_accounts,
			throwOnCallFailures: false,
			throwOnTransactionFailures: true, // Useful to estimate wrong root cost
			forking: {
				enabled: toBool(process.env.FORKING_ENABLED),
				url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
			},
			live: false,
			saveDeployments: true,
			tags: ["test", "local"]
		},
		mainnet: {
			accounts: custom_accounts,
			url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
			live: true,
			saveDeployments: true,
			tags: ["live"]
		}
	},
	mocha: {
		timeout: 600000
	},
	namedAccounts: {
		hushhardware1: process.env.HUSH_HARDWARE,
		deployer: 0,
		proposer1: 1,
		proposer2: 2,
		proposer3: 3,
		executor1: 4,
		executor2: 5,
		executor3: 6,
		user: 9,
	}
};

export default config;
