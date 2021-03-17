import { BigNumber } from 'ethers';
import { toBN } from 'web3-utils';
import { randomBN, pedersenHashBuffer } from "./utils";

class Note {

    commitment: any;
    secret: any;
    nonce: any;
    amount: BigNumber;
    tokenAddress: string;
    index: number | undefined;

    constructor(tokenAddress: string, amount: BigNumber = BigNumber.from(0), { secret, nonce } = { secret: randomBN(31), nonce: randomBN(31) }) {
        this.secret = secret;
        this.nonce = nonce;
        this.amount = amount;
        this.tokenAddress = tokenAddress;
        this.commitment = pedersenHashBuffer(
            Buffer.concat([this.secret.toBuffer('le', 31), this.nonce.toBuffer('le', 31)]),
        );
        this.index = undefined;
    }

    setIndex(index: number) {
        this.index = index;
    }

    getNullifier() {
        if (this.index == undefined){
            throw Error("Index not defined");
        }
        return pedersenHashBuffer(
            Buffer.concat([this.secret.toBuffer('le', 31), toBN(this.index).toBuffer('le', 31)]),
        );
    }

    stringify() {
        return {
            amount: this.amount.toString(),
            secret: this.secret.toString(),
            nonce: this.nonce.toString(),
            token: this.tokenAddress,
            index: this.index
        };
    }

    toSave() {
        return JSON.stringify(this.stringify());
    }

    static fromSave(saveString: string) {
        let tempElem: Note = JSON.parse(saveString);
        let temp = new Note(tempElem.tokenAddress, tempElem.amount,
            {
                secret: toBN(tempElem.secret),
                nonce: toBN(tempElem.nonce),
            });
        if (!tempElem.index){
            throw Error("Index not defined");
        }
        temp.setIndex(tempElem.index);
        return temp;
    }

}


export {
    Note
}