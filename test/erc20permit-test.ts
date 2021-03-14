import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { signTypedData_v4 } from 'eth-sig-util';
// https://docs.metamask.io/guide/signing-data.html#sign-typed-data-v4

import { PERMIT_TYPEHASH, getPermitDigest, getDomainSeparator, sign } from './../utils/signatures';

describe("Permit token", function () {

    it("Initialises DOMAIN_SEPERATOR and PERMIT_TYPEHASH correctly", async function () {
        let [deployer] = await ethers.getSigners();

        const ERCPermit = await ethers.getContractFactory("ERC20Tester", deployer);
        const token = await ERCPermit.deploy("10000");
        await token.deployed();

        let name = await token.name();
        let chainId = 31337;
        expect(await token.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(name, token.address, chainId));
        expect(await token.PERMIT_TYPEHASH()).to.equal(PERMIT_TYPEHASH);
    });

    it("Testing the permit test", async function () {
        let [deployer, user2] = await ethers.getSigners();

        const ownerPrivateKey = Buffer.from('c5e8f61d1ab959b397eecc0a37a6517b8e67a0e7cf1f4bce5591f3ed80199122', 'hex')
        let user = new ethers.Wallet(ownerPrivateKey);
        const ERCPermit = await ethers.getContractFactory("ERC20Tester", deployer);
        const token = await ERCPermit.deploy("10000000");
        await token.deployed();

        await token.transfer(await user.getAddress(), "500");
        expect(await token.balanceOf(await user.getAddress())).to.equal(500);

        for (let i = 0; i < 1; i++) {
            await token.transfer(await user.getAddress(), "5000");
        }

        const approve = {
            owner: await user.getAddress(),
            spender: await deployer.getAddress(),
            value: 1,
        };

        let deadline = 100000000000000;
        let nonce = await token.nonces(await user.getAddress());
        let name = await token.name();
        let chainId = 31337;

        expect(await token.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(name, token.address, chainId));
        expect(await token.PERMIT_TYPEHASH()).to.equal(PERMIT_TYPEHASH);

        const digest = getPermitDigest(name, token.address, chainId, approve, nonce, deadline);
        let { v, r, s } = sign(digest, ownerPrivateKey);

        //console.log(v, BigNumber.from(r).toHexString(), BigNumber.from(s).toHexString());
        await token.permit(approve.owner, approve.spender, approve.value, deadline, v, r, s);

        for (let i = 0; i < 1; i++) {
            nonce = await token.nonces(await user.getAddress());
            // Trying with something that should work with metamask
            const permitParams = {
                types: {
                    EIP712Domain: [
                        { name: "name", type: "string" },
                        { name: "version", type: "string" },
                        { name: "chainId", type: "uint256" },
                        { name: "verifyingContract", type: "address" },
                    ],
                    Permit: [
                        { name: "owner", type: "address" },
                        { name: "spender", type: "address" },
                        { name: "value", type: "uint256" },
                        { name: "nonce", type: "uint256" },
                        { name: "deadline", type: "uint256" },
                    ],
                },
                primaryType: "Permit",
                domain: {
                    name: name,
                    version: "1",
                    chainId: chainId,
                    verifyingContract: token.address,
                },
                message: {
                    owner: approve.owner,
                    spender: approve.spender,
                    value: approve.value,
                    nonce: nonce.toNumber(),
                    deadline: deadline,
                },
            }

            const signature = signTypedData_v4(ownerPrivateKey, { data: permitParams });
            let split2 = ethers.utils.splitSignature(signature);
            await token.permit(approve.owner, approve.spender, approve.value, deadline, split2.v, split2.r, split2.s);
        }
    });


});