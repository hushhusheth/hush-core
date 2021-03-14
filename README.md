> Hush Hush is based greatly on Tornado.cash, and would not exits without it. We are greatly thankful for the help and time its members has given us for questions and elaboration.

# Disclaimer

This project has **NOT** been audited. Furthermore, it relies on the groth16 proofsystem which uses a trusted setup, where phase 2 is currently generated by the team. 

The software should be seen as ALPHA software, and not be intrusted with all of your wealth.

# Introduction

Hush Hush is a non-custodial privacy solution that allow anyone to transfer tokens in a privacy preserving manner. It does so by using zk-SNArKs to break the links between sender and receipient in the transaction. In practice, the user will deposit his funds into a HushPool from which he can later withdraw, without leaking the original depositor.

The user will generate a secret, which he send to the HushPool along with a proof of insertion, the pool will then update its state (tree) and pull funds from the users account (he must have approved beforehand). 

Because the proof validates correct insertion, and only require few additional computations for each extra insert, we can insert multiple deposits in the same transaction at a small extra cost. We allow a user to generate up to 8 secrets, which are all inserted into the pool in the same transaction (assuming he has approved 8 * deposit size). These multi-deposits allow us to support aggregating of up to 8 deposits from different users, effectively splitting the gas for the proof verification, which is the majority of cost for normal ERC20 deposits. See [medium](https://medium.com/hushhusheth/busses-and-service-changes-990aff81003e) for more information.

When the user wish to withdraw from the pool, he will generate a proof that he knows the secret of an unspent deposit in the pool. The proof is then passed to the contract, which will verify the proof, and transfer funds to the specified recipient.

# Supported tokens and cost implications

While the scheme supports any ERC20 to be transferred, it requires a sufficiently large pool to properly conceal the user. As each pool have a specific token and denominator, there will be a few pools for the same token, with different denominator (deposit size). The set of possible denominators should be small to ensure that the pools do not become too small. This also means that small tokens should not expect a pool

Furthermore, not all ERC20 are created equal with respect to transfer costs. A type of token where this is incredible visible is the interest-bearing tokens from Compound (cEth) and Aave (aWeth). Transferring these tokens includes a computation to evaluate whether the positions becomes illiquid, e.g., gas-intensive. In addition the aTokens from Aave also has the extra oddity, that the interest is accrued on the balance of tokens and not a ratio between it and the underlying asset. To most easily support such tokens, we wrap them in a "normal" ERC20, e.g., aWeth becomes WaWeth. While the transfer  becomes cheaper because of this, the cost is just offset to the wrapping/unwrapping of the token. 

To make it as easy as possible for the user, it is possible to use the AZap, which will wrap aTokens and directly deposit them into the HushPool in one transaction. 

### Some gas costs

| Action                                          | Gas       | Cost*      |
| ----------------------------------------------- | --------- | ---------- |
| Single Deposit (simple ERC20)                   | 377K gas  | 0.0377 eth |
| Multi Deposit (8 from same user) (simple ERC20) | 450K gas  | 0.0450 eth |
| Withdraw (simple ERC20)                         | 382K gas  | 0.0382 eth |
|                                                 |           |            |
| Single Deposit (cEth)                           | 473K gas  | 0.0473 eth |
| Multi Deposit (8 from same user) (cEth)         | 482K gas  | 0.0482 eth |
| Withdraw (cEth)                                 | 522K gas  | 0.0522 eth |
|                                                 |           |            |
| Single Deposit AZap                             | 545K gas  | 0.0545 eth |
| Multi Deposit AZap                              | 627K gas  | 0.0626 eth |
|                                                 |           |            |
| Buy bus ticket                                  | 45K gas   | 0.0045 eth |
| Drive bus 8 deposits (simple ERC20)             | 550K gas  | 0.0550 eth |
| Drive bus 8 deposits (cEth)                     | 1044K gas | 0.1044 eth |
|                                                 |           |            |

The cost is computed with 100 GWei being the gas price. As it is visible, the extra computation on non-wrapped interest-bearing tokens is rather expensive (look at the bus).

# System outline

To keep track of deposits, the Hush Hush system utilises a Merkle-Tree of deposit-commitments and a mapping to keep track of spent nullifiers. The tree has a depth/height of 20, meaning that it can hold 2^20 deposits. The leafs of the tree are Pedersen hashes to secrets generated by the user at time of deposit, and the hash function utilised in the tree is the Poseidon hash function.

When a user is depositing, he will generate a *secret* and a *nonce* which he will use in the Pedersen hash, i.e., *Pedersen(secret, nonce)*. He then inserts this leaf into the tree of deposit-commitments. However, doing so is fairly expensive if done fully on-chain, hence it requires one hash for each layer in the tree. For the Poseidon hash function, this would be 767K gas just for the tree update, see [ethresear.ch](https://ethresear.ch/t/gas-and-circuit-constraint-benchmarks-of-binary-and-quinary-incremental-merkle-trees-using-the-poseidon-hash-function/7446). To reduce the gas cost, we update the tree off-chain and prove inside a zk-SNArK that we updated the state correctly. Instead of computing all the hashes we just have to evaluate the proof onchain. When proving only the computation inside the snark, we can let anyone build the proof, and have more than one insertion inside - a micro-rollup. For more info on rollups see Vitaliks post [An Incomplete Guide to Rollups](https://vitalik.ca/general/2021/01/05/rollup.html). For each additional deposit we require little information, so with all the hashes inside the snark, 7 extra deposits costs us only approx 70K gas.

While this is great for gas, it has some implications on censorship resistance. While all the necessary information is on-chain for anyone to generate a valid proof. Any updates to the merkle-tree, e.g., inserts, will change the state, meaning that a proof generated with the "old" root, will be rejected when the transaction is mined. As long as there is not multiple deposit-proofs in the same block, this is no issue. However, an attacker could watch the contracts, and "frontrun" any deposits, effectively keeping people from entering the pool. **Note** that withdraws don't alter the tree, and cannot be censored. An attacker could keep you from entering, but never from leaving. 

To withdraw, the user will use the *secret* from his deposit, and the deposits *index* in the tree. With this at hand, he compute the nullifier as *Pedersen(secret, index)*, and prove that this nullifier corrosponds to a deposit in the tree without disclosing which. When given to the smart contract, it will check that the proof is valid and that the nullifier has not been spent before. If both checks are passed, the nullifier is added to the set of spent nullifiers, and the funds is transferred to the specified account. The proof can be published by anyone, so the spender should use a relayer to not leak his identity. 

The overall architecture is somewhat like the following image (simplified), there is a Factory which point to the verifies and keep a registry of existing pools and generate new ones. The pool itself will then have a deposit root stored in the contract, and every leaf as input data to in transactions, and retrievable through events as well. The greyed out nodes are only computed inside the proof, and never sees the blockchain itself, note that there is many more layers than in the drawing, 20 in total.  

**![HushFactory](/Users/lasseherskind/Downloads/HushFactory.svg)**

# Governance - updating verifiers, adding pools and controlling fees

In the midst of the Hush Hush system is the HushPool factory, a contract that acts as a registry of pools, and points to the proof verifiers. The owner can create new pools, update verifiers and specify a withdraw fee (at most 1%) and who may collect the fee. The factory is owned by a Timelock factory, but will be handed over to the community after token distribution. At this point in time, the governance, may decide to pay token-holders with the fees collected, or whatever it decides. The owner also has the ability to retire the pools. This simply removes them from the registry, and can be used in the case where a pool is filled and a new is to be deployed.

Before handing over the keys to the castle, a ceremony is required to update the verifies to ensure that neither the Hush Hush team nor any other party can compromise the security of the system. When the verifiers have been updated, the contract will be ossified, meaning that it will become impossible to update the verifiers again.  

# the trusted setup

To generate the keys for our circuits, we have used the [Perpatual Powers of Tau](https://github.com/weijiekoh/perpetualpowersoftau/) Phase 1 as Base. More specifically we used `powersOfTau28_hez_final_17.ptau` with from [Dropbox](https://www.dropbox.com/sh/mn47gnepqu88mzl/AACaJkBU7mmCq8uU8ml0-0fma?dl=0) which is introduced in the description of [snarkjs](https://github.com/iden3/snarkjs).  

To verify the setup, go to the `zkproofs` folder and run the `verify.sh` script. The script will use snarkjs to first verify Phase 1, from PPoT, and then verify keys for the three circuits.  

# Testing

We have two sets of test, 1) that can be run with no access to mainnet, i.e., fully locally, and 2) that is most easily run with a mainnet fork as it uses Aave and Compound tokens. We use the gas-reporter plugin for hardhat to measure gas usage as well.

## No Fork Necessary

To run the set of test that does not require the fork, disable forking and run

```bash
npx hardhat test test/controller-test.ts test/erc20permit-test.ts  test/hush-test.ts test/merkle-test.ts test/prover_verifier-test.ts test/rebuild-merkle-test.ts
```

![image-20210314094310470](/Users/lasseherskind/GitHub/hush-core/images/no-fork-gas.png)

## Fork

To run the set of test that requires forking, enable fork and run:

```bash
npx hardhat test test/busstation-test.ts test/full-launch-test.ts test/watoken-test.ts test/zap-test.ts
```

![image-20210314094823424](/Users/lasseherskind/GitHub/hush-core/images/fork-gas.png)

## Simulation

Beyond these tests, there is also a simulation script `scripts/simulation.ts` which will run a number of initial deposits for each user, before randomly picking between single deposits, multi deposits and withdrawing (non uniform randomness). There will be 5 initial deposits per user, followed by 150 random actions. At last, we will rebuild the deposit-tree using the events emitted and perform a withdraw and deposit using this freshly build tree. The simulation will be using the Wrapped aWeth pool with 1 token a deposit size. 

# Technical Details

## Wrapped ATokens

The wrapped aTokens is closely inspired by the WETH10 implementation. Its purpose it to provide a token that has a fixed balance to be deposited into the pool. 

When depositing aToken into the Wrapped atoken, the amount of Wrapped aTokens received is computed using the scaled amount of aTokens. The scaled amount is fixed, and do not change over time, but allows us to compute the underlying amount of aTokens at a later point in time, e.g., when withdrawing.

As we are to support multiple aTokens, there is a Wrapped aToken Factory, which uses a minimal proxy for Wrapped aTokens beyond the first (the genesis).

## Hush Pools

The Hush Pools are a relatively small contract, which allows the user to deposit and withdraw. It is deployed as a minimal proxy of a genesis pool to make it cheaper to deploy additional pools.

# CLI - proof generation

To make it as easily available for the average user, we support proof generation on the web application. However, for those who prefer to generate the proofs themselves, we provide a minimal CLI which can be used to generate the proofs without using the website. It requires a RPC as it will retrieve events to compute the current tree which is used in the proofs.





