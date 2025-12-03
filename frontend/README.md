# MegaPlace Frontend

React + TypeScript + Vite frontend for MegaPlace - a collaborative pixel canvas on MegaETH.

## Quick Start

```bash
# Install dependencies
bun install

# Start development server (uses local backend at localhost:3001)
bun dev

# Build for production (uses arweave.tech backend)
bun build
```

## Environment Configuration

The frontend automatically detects the environment and uses the appropriate backend:

| Environment | Backend URL                          | Auto-detected                         |
| ----------- | ------------------------------------ | ------------------------------------- |
| Development | `http://localhost:3001`              | `bun dev` or `localhost` hostname     |
| Production  | `https://arweave.tech/api/megaplace` | `bun build` or non-localhost hostname |

### Custom Configuration

Create a `.env.local` file to override defaults:

```bash
# Force a specific backend URL
VITE_BACKEND_URL=http://localhost:3001

# Or for production
VITE_BACKEND_URL=https://arweave.tech/api/megaplace

# Force environment mode
VITE_APP_ENV=development  # or 'production'
```

### Configuration Files

- `src/config/env.ts` - Environment detection and backend URL configuration
- `src/contracts/config.ts` - Contract address and chain configuration
- `src/constants.ts` - App constants (canvas size, colors, etc.)

## Backend API

The backend provides:

- **`GET /api/pixels`** - All pixels (JSON, supports `?limit=N&offset=M`)
- **`GET /api/pixels/binary`** - All pixels (binary format, 12 bytes/pixel)
- **`GET /api/pixels/stream`** - SSE real-time pixel updates
- **`GET /api/pixels/:x/:y`** - Single pixel
- **`GET /api/pixels/region/:x/:y/:w/:h`** - Region of pixels
- **`GET /api/stats`** - Sync status and stats
- **`GET /health`** - Health check

### Binary Format

The binary endpoint returns pixel data as:
- 4 bytes: x coordinate (uint32, little-endian)
- 4 bytes: y coordinate (uint32, little-endian)
- 4 bytes: color (uint32, little-endian)

This is ~10x smaller than JSON for large datasets.

### Server-Sent Events (SSE)

Connect to `/api/pixels/stream` for real-time updates:

```javascript
const eventSource = new EventSource('/api/pixels/stream');
eventSource.addEventListener('pixel', (event) => {
  const pixel = JSON.parse(event.data);
  // { x, y, color, placedBy, timestamp }
});
```

## Development

```bash
# Start frontend dev server
bun dev

# Start backend (in separate terminal)
cd ../backend && bun dev

# Build production bundle
bun build

# Preview production build
bun preview
```

## Project Structure

```
src/
├── config/
│   └── env.ts          # Environment configuration
├── contracts/
│   ├── config.ts       # Contract & chain config
│   └── MegaplaceABI.json
├── hooks/
│   ├── useMap.ts       # Map state & pixel rendering
│   ├── useMegaplace.ts # Contract interactions
│   └── useSessionKey.ts # Session key management
├── services/
│   └── backendApi.ts   # Backend API client
├── constants.ts        # App constants
└── App.tsx             # Main app component
```
