# Megaplace Backend

Backend service for Megaplace that listens to smart contract events and provides a REST API for pixel data.

## Features

- 🎯 Listens to `PixelPlaced` events from the Megaplace smart contract
- 💾 Stores pixel data in JSON format for fast retrieval
- 🚀 REST API with JSON and binary formats
- 📡 Server-Sent Events (SSE) for real-time updates
- 🔄 Parallel historical sync (5x faster)
- ⚡ Real-time event watching with WebSocket support
- 📊 Auto-saves data with smart debouncing
- 🔌 Automatic fallback from WebSocket to HTTP
- 💪 Resilient restart - continues from where it left off

## Quick Start

```bash
# Install dependencies
bun install

# Create .env file
cp .env.example .env

# Start development server
bun dev

# Or build and run production
bun build && bun start
```

## Configuration

Create `.env` file:

```bash
# RPC Configuration (WebSocket preferred for real-time)
RPC_URL=wss://timothy.megaeth.com/rpc

# Contract Configuration
CONTRACT_ADDRESS=0xF7bB0ba31c14ff85c582f2b6F45355abe01dCB07
DEPLOYMENT_BLOCK=4211820

# Server Configuration
PORT=3001
DATA_DIR=./data
```

## API Endpoints

### Health & Stats

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with memory stats |
| `GET /api/stats` | Sync status and pixel count |

### Pixel Data

| Endpoint | Description |
|----------|-------------|
| `GET /api/pixels` | All pixels (JSON) |
| `GET /api/pixels?limit=N&offset=M` | Paginated pixels |
| `GET /api/pixels/binary` | All pixels (binary, 12 bytes/pixel) |
| `GET /api/pixels/stream` | SSE real-time updates |
| `GET /api/pixels/:x/:y` | Single pixel |
| `GET /api/pixels/region/:x/:y/:w/:h` | Region of pixels |

### Response Formats

**JSON Format** (`/api/pixels`):
```json
{
  "success": true,
  "count": 1000,
  "total": 5000,
  "hasMore": true,
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

**Binary Format** (`/api/pixels/binary`):
- 12 bytes per pixel: `[x: u32][y: u32][color: u32]` (little-endian)
- ~10x smaller than JSON
- Header: `X-Pixel-Count: N`

**SSE Format** (`/api/pixels/stream`):
```
event: connected
data: {"message":"Connected to pixel stream"}

event: pixel
data: {"x":100,"y":200,"color":16711680,"placedBy":"0x1234...","timestamp":1700000000}

event: heartbeat
data: {"timestamp":1700000000000}
```

## Nginx Configuration (Production)

For production deployment at `arweave.tech/api/megaplace`, configure nginx:

```nginx
# Proxy /api/megaplace/* to backend at localhost:3001/*
location /api/megaplace/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    
    # Required for SSE
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
    
    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts for long-running SSE connections
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

This maps:
- `https://arweave.tech/api/megaplace/api/pixels` → `http://localhost:3001/api/pixels`
- `https://arweave.tech/api/megaplace/health` → `http://localhost:3001/health`

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   MegaETH RPC   │      │     Backend     │      │    Frontend     │
│   (WebSocket)   │◄────►│   (Express.js)  │◄────►│    (React)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                       │                        │
         │  PixelPlaced events   │   REST API             │
         │  Historical sync      │   SSE stream           │
         │                       │   Binary format        │
         │                       │                        │
         │                       ▼                        │
         │               ┌─────────────────┐              │
         │               │  pixels.json    │              │
         │               │  (persistent)   │              │
         │               └─────────────────┘              │
```

### Components

1. **Event Listener** (`eventListener.ts`)
   - Parallel historical sync (5 chunks at once)
   - Real-time WebSocket event watching
   - Smart debounced saves
   - SSE callback system

2. **API Server** (`app.ts`)
   - Express.js REST API
   - CORS + compression
   - SSE endpoint with heartbeats
   - Binary format support
   - Pagination

3. **Data Storage** (`data/pixels.json`)
   - JSON persistence
   - Format: `{ pixels: { "x,y": PixelData }, lastProcessedBlock, totalPixels }`

## Frontend Integration

The frontend uses a hybrid approach:

1. **Initial Load**: Fetch all pixels via `/api/pixels/binary` (fast, compact)
2. **Real-time**: Subscribe to SSE at `/api/pixels/stream`
3. **Fallback**: If SSE fails, poll contract events directly

This minimizes RPC calls while maintaining real-time sync.

## Development

```bash
# Start with hot reload
bun dev

# Build TypeScript
bun build

# Run production
bun start
```
