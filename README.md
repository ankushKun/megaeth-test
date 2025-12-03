# 🌍 Megaplace

A decentralized pixel canvas mapped to Earth. Place pixels anywhere on the planet on MegaETH's 10ms block times.

**[Live Demo →](https://ankush.one/megaplace)**

---

## ✨ What's Cool

**🗺️ Earth-Scale Canvas**  
~1 trillion pixels using Web Mercator projection. Zoom from continents down to individual pixels at any location on Earth.

**⚡ Real-Time on MegaETH**  
10ms blocks mean your pixels appear instantly. No waiting, no batching.

**🔑 Session Keys**  
Sign once, place many. No wallet popup for every pixel—gasless UX with delegated signing.

**📡 Live Sync**  
Server-Sent Events stream every pixel placement globally in real-time.

**💎 Premium Mode**  
Pay 0.01 ETH for 2 hours of unlimited placement (no rate limits).

---

## 🏗️ Stack

| Layer             | Tech                              |
| ----------------- | --------------------------------- |
| Contract          | Solidity • Hardhat • OpenZeppelin |
| Backend (caching) | Bun • Express • Viem              |
| Frontend          | React • Vite • Wagmi • Leaflet    |
| Network           | MegaETH Testnet (Chain 6343)      |

---

## 🚀 Quick Start

```bash
# Install
bun install

# Deploy contract (updates frontend config automatically)
bun run contracts:deploy

# Run frontend
bun run dev
```

---


Built for the MegaETH ecosystem 🔥
