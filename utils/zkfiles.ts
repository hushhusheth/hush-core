import { readFileSync } from "fs";

let files = {};
let buildFolder = process.cwd() + "/zkproofs/build";
let circuits = ["SingleDeposit", "MultiDeposit", "Withdraw"];

for (let i = 0; i < circuits.length; i++) {
    let circuitFiles = {};
    circuitFiles["wasm"] = buildFolder + "/wasm/" + circuits[i] + ".wasm";
    circuitFiles["zkey"] = buildFolder + "/zKeys/" + circuits[i] + "_final.zkey";
    let vKeySrc = buildFolder + "/vKeys/" + circuits[i] + "Verification_key.json";
    circuitFiles["vkey"] = JSON.parse(readFileSync(vKeySrc).toString());
    files[circuits[i]] = circuitFiles;
}


export { files };