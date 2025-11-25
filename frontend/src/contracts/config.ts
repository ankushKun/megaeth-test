// Contract addresses
export const MEGAPLACE_ADDRESS = "0xF7bB0ba31c14ff85c582f2b6F45355abe01dCB07" as const;

// Contract deployment block - update this to the actual deployment block
export const MEGAPLACE_DEPLOYMENT_BLOCK = 4211820n; // TODO: Update with actual deployment block

export const MEGAETH_CHAIN = {
  id: 6343,
  name: "MegaETH Testnet",
  network: "megaeth",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://timothy.megaeth.com/rpc"],
      webSocket: ["wss://timothy.megaeth.com/rpc"],
    },
    public: {
      http: ["https://timothy.megaeth.com/rpc"],
      webSocket: ["wss://timothy.megaeth.com/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "MegaExplorer",
      url: "https://megaexplorer.xyz",
    },
  },
  testnet: true,
} as const;
