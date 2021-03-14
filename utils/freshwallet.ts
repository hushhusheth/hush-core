import { Wallet } from "ethers";
import { randomBytes as _randomBytes } from "crypto";
import { arrayify } from "@ethersproject/bytes";

function randomBytes(length: number): Uint8Array {
    return arrayify(_randomBytes(length));
}

const wallet = Wallet.createRandom({ extraEntropy: randomBytes(64) });

console.log(wallet.mnemonic);
