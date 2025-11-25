# Megaplace Backend

Backend service for Megaplace that listens to smart contract events and provides a REST API for pixel data.

## Features

- 🎯 Listens to `PixelPlaced` events from the Megaplace smart contract
- 💾 Stores pixel data in JSON format for fast retrieval
- 🚀 Provides REST API endpoints for frontend consumption
- 🔄 Syncs historical events on startup from last processed block
- ⚡ Real-time event watching with WebSocket support
- 📊 Auto-saves data periodically
- 🔌 Automatic fallback from WebSocket to HTTP
- 💪 Resilient restart - continues from where it left off

## Setup

1. Install dependencies:
```bash
npm install
# or
bun install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update the `.env` file with your configuration:
   - **RPC_URL**: Use WebSocket URL (`wss://`) for best performance, or HTTP URL (`https://`) as fallback
   - **CONTRACT_ADDRESS**: The deployed Megaplace contract address
   - **DEPLOYMENT_BLOCK**: Block number when contract was deployed
   - **DATA_DIR**: Directory to store pixel data (default: `./data`)

### WebSocket vs HTTP

For optimal real-time performance, use a WebSocket URL:
```env
RPC_URL=wss://megaeth-testnet.g.alchemy.com/v2/YOUR_API_KEY
```

The backend will automatically:
- Use WebSocket for real-time event watching
- Fall back to HTTP if WebSocket fails
- Reconnect automatically with exponential backoff

## Development

Start the development server with hot reload:
```bash
npm run dev
# or
bun run dev
```

## Production

Build and run:
```bash
npm run build
npm start
# or
bun run build
bun start
```

## API Endpoints

### `GET /health`
Health check endpoint
```json
{
  "status": "ok",
  "uptime": 123.45,
  "totalPixels": 1000,
  "lastProcessedBlock": "4250000",
  "isWatching": true
}
```

### `GET /api/stats`
Get storage statistics
```json
{
  "success": true,
  "totalPixels": 1000,
  "lastProcessedBlock": "4250000",
  "isWatching": true
}
```

### `GET /api/pixels`
Get all pixels
```json
{
  "success": true,
  "count": 1000,
  "pixels": [
    {
      "x": 100,
      "y": 200,
      "color": 16711680,
      "placedBy": "0x1234...",
      "timestamp": 1700000000
    }
  ]
}
```

### `GET /api/pixels/:x/:y`
Get specific pixel at coordinates
```json
{
  "success": true,
  "pixel": {
    "x": 100,
    "y": 200,
    "color": 16711680,
    "placedBy": "0x1234...",
    "timestamp": 1700000000
  }
}
```

### `GET /api/pixels/region/:startX/:startY/:width/:height`
Get pixels in a rectangular region
```json
{
  "success": true,
  "count": 50,
  "pixels": [...]
}
```

## Architecture

1. **Event Listener** (`eventListener.ts`)
   - Syncs historical events from deployment block
   - Watches for new events in real-time
   - Stores data in JSON format
   - Auto-saves periodically

2. **API Server** (`app.ts`, `index.ts`)
   - Express.js REST API
   - CORS enabled for frontend access
   - Compression middleware for faster responses
   - Error handling

3. **Data Storage** (`data/pixels.json`)
   - JSON file storing all pixel data
   - Format: `{ pixels: { "x,y": PixelData }, lastProcessedBlock, totalPixels }`
   - Auto-saved on events and periodically

## Frontend Integration

The frontend should:
1. Fetch initial pixel data from `/api/pixels` on load
2. Then listen to contract events directly for real-time updates
3. This hybrid approach minimizes RPC calls while maintaining real-time sync
