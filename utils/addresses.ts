
const ADDRESSES_ALL = {
    KOVAN: {
    },
    MAIN: {
        "lendingpool": "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9",
        "aaveprotocoldataprovider": "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
        "weth": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "aweth": "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
        "dai": "0x6b175474e89094c44da98b954eedeac495271d0f",
        "adai": "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
        "ceth": "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
    }
};

// Swap MAIN for KOVAN if using testnet.
const ADDRESSES = ADDRESSES_ALL["MAIN"];

export { ADDRESSES, ADDRESSES_ALL };