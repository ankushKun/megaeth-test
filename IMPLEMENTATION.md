# Backend Implementation Summary

## What Was Built

An Express.js backend service that:
1. **Listens to contract events** from the Megaplace smart contract
2. **Stores pixel data** in JSON format for fast retrieval
3. **Provides REST API** for frontend to fetch pixel data
4. **Handles rate limiting** with retry logic and exponential backoff
5. **Resumes from last block** on restart

## Key Features Implemented

### 1. Event Listener Service (`eventListener.ts`)
- ✅ Syncs historical events from last processed block
- ✅ Watches for new events in real-time via WebSocket
- ✅ Stores data in JSON with auto-save
- ✅ **Rate Limit Handling**:
  - Smaller chunk size (1k blocks instead of 10k)
  - Exponential backoff retry (3s, 6s, 12s, 24s, 48s)
  - 500ms delay between chunks
- ✅ **Resume from Last Block**:
  - Saves `lastProcessedBlock` in JSON
  - Loads on startup and continues from there
- ✅ **WebSocket Support**:
  - Primary: WebSocket for real-time events
  - Fallback: HTTP for historical sync
  - Auto-reconnect with retries

### 2. REST API (`app.ts`)
- `GET /health` - Health check
- `GET /api/stats` - Get statistics
- `GET /api/pixels` - Get all pixels
- `GET /api/pixels/:x/:y` - Get specific pixel
- `GET /api/pixels/region/:x/:y/:w/:h` - Get region

### 3. Frontend Integration (`backendApi.ts` + `useMap.ts`)
- ✅ Checks backend health on mount
- ✅ Loads initial data from backend
- ✅ Falls back to contract if backend unavailable
- ✅ Listens to contract events for real-time updates

## Architecture Flow

```
Contract Events
      ↓
Backend Event Listener
      ↓
JSON Storage (data/pixels.json)
      ↓
REST API
      ↓
Frontend (initial load)
      ↓
Contract Events (real-time updates)
```

## Configuration

### Backend `.env`
```env
PORT=3001
RPC_URL=wss://timothy.megaeth.com/rpc  # WebSocket URL
CONTRACT_ADDRESS=0xF7bB0ba31c14ff85c582f2b6F45355abe01dCB07
DEPLOYMENT_BLOCK=4211820
DATA_DIR=./data
```

### Frontend `.env.local`
```env
VITE_BACKEND_URL=http://localhost:3001
```

## Rate Limiting Solution

The MegaETH RPC has strict compute unit limits. Handled by:

1. **Smaller chunks**: 1,000 blocks per request (down from 10,000)
2. **Retry logic**: Up to 5 retries with exponential backoff
3. **Delays**: 500ms between chunk requests
4. **Error handling**: Gracefully skips failed batches after max retries

## Running the System

```bash
# Terminal 1: Backend
cd backend
bun install
bun run dev

# Terminal 2: Frontend
cd frontend
bun install
bun run dev
```

## Data Persistence

The `data/pixels.json` file stores:
```json
{
  "pixels": {
    "100,200": {
      "x": 100,
      "y": 200,
      "color": 16711680,
      "placedBy": "0x123...",
      "timestamp": 1700000000
    }
  },
  "lastProcessedBlock": "4250000",
  "totalPixels": 1234
}
```

On restart, the backend:
1. Reads this file
2. Continues from `lastProcessedBlock + 1`
3. Syncs any missed events
4. Resumes real-time watching

## Benefits

- **Fast initial load** - Frontend gets all pixels instantly from backend
- **Real-time updates** - Contract events provide live updates
- **Reduced RPC calls** - Backend handles the heavy lifting
- **Persistent cache** - Data survives restarts
- **Rate limit resilient** - Automatic retry and backoff
- **WebSocket support** - Faster real-time event delivery
