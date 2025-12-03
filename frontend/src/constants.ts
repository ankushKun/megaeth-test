// Shared constants for the MegaPlace application
// These values should match the smart contract and be used across the frontend

// Canvas configuration (must match smart contract)
export const CANVAS_RES = 1048576; // 2^20 - total pixels per dimension
export const TILE_SIZE = 512; // Standard tile size
export const MAX_REGION_SIZE = 10000; // Maximum pixels in a region query

// Rate limiting (default values, can be changed via contract)
export const DEFAULT_COOLDOWN_SECONDS = 5;
export const DEFAULT_COOLDOWN_PIXELS = 15;
export const DEFAULT_PREMIUM_COST_ETH = '0.01';
export const DEFAULT_PREMIUM_DURATION_HOURS = 2;

// Session key configuration
export const SESSION_KEY_STORAGE_KEY = 'megaplace_session_key';
export const SESSION_KEY_FUNDING_AMOUNT = '0.001'; // ETH to fund session key

// Batch limits
export const MAX_WRITE_BATCH_SIZE = 100;
export const MAX_READ_BATCH_SIZE = 1000;

// Polling intervals
export const EVENT_POLLING_INTERVAL_MS = 500;
export const COOLDOWN_REFETCH_INTERVAL_MS = 1000;
export const PREMIUM_REFETCH_INTERVAL_MS = 5000;

// Map configuration
export const DEFAULT_MAP_CENTER: [number, number] = [37.757, -122.4376]; // San Francisco
export const DEFAULT_MAP_ZOOM = 7;
export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 18;
export const PIXEL_SELECT_ZOOM = 16; // Zoom level when clicking a pixel

// Throttling
export const MAP_MOVE_THROTTLE_MS = 500;

// Special transparent/erase color - placing this sets the pixel to 0 (unset)
// Displayed with a checkered pattern in the UI
export const TRANSPARENT_COLOR = 'TRANSPARENT';

// Expanded color palette - two rows of vibrant colors like wplace.live
// 19 colors per row = 38 total
export const PRESET_COLORS = [
    // Row 1 - Neutrals + warm colors
    '#000000', // Black
    '#1A1A2E', // Dark navy
    '#4A4A4A', // Dark gray
    '#7F7F7F', // Medium gray
    '#C0C0C0', // Silver
    '#FFFFFF', // White
    '#6B0000', // Dark red
    '#BE0039', // Crimson
    '#FF4500', // Red-orange
    '#FF6B35', // Orange
    '#FFA800', // Amber
    '#FFD635', // Yellow
    '#FFF8B8', // Cream
    '#00A368', // Green
    '#00CC78', // Emerald
    '#7EED56', // Lime
    '#00756F', // Teal
    '#009EAA', // Cyan
    '#00CCC0', // Aqua

    // Row 2 - Blues, purples, pinks, browns
    '#2450A4', // Navy blue
    '#3690EA', // Blue
    '#51E9F4', // Light blue
    '#493AC1', // Indigo
    '#6A5CFF', // Purple-blue
    '#94B3FF', // Periwinkle
    '#811E9F', // Purple
    '#B44AC0', // Magenta
    '#E4ABFF', // Lavender
    '#DE107F', // Pink
    '#FF3881', // Hot pink
    '#FF99AA', // Light pink
    '#6D482F', // Brown
    '#9C6926', // Tan
    '#FFB470', // Peach
    '#515252', // Charcoal
    '#898D90', // Cool gray
    '#D4D7D9', // Light gray
    TRANSPARENT_COLOR // Transparent/Erase - sets pixel to unset
] as const;

// Web Mercator projection limits
export const MAX_LATITUDE = 85.05112878;

// Transaction timeouts
export const TX_CONFIRMATION_TIMEOUT_MS = 60000;

// Note: Backend URL configuration moved to src/config/env.ts
// Use: import { config } from './config/env' for backend URL
