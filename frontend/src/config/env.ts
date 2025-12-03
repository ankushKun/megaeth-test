/**
 * Environment configuration for MegaPlace frontend
 * 
 * Environment Variables (set in .env.local):
 * - VITE_BACKEND_URL: Backend API base URL (overrides auto-detection)
 * - VITE_APP_ENV: 'development' | 'production' (overrides auto-detection)
 * 
 * Auto-detection:
 * - Development: localhost:3001 (when running `bun dev` or on localhost)
 * - Production: arweave.tech/api/megaplace (when built or on non-localhost)
 * 
 * Contract config is in src/contracts/config.ts
 */

import { MEGAPLACE_ADDRESS } from "@/contracts/config";

// =============================================================================
// BACKEND CONFIGURATION
// =============================================================================

// Production backend URL (arweave.tech with nginx proxy adding /api/megaplace)
const PRODUCTION_BACKEND_URL = 'https://arweave.tech/api/megaplace';

// Local development backend URL
const DEVELOPMENT_BACKEND_URL = 'http://localhost:3001';

/**
 * Detect if we're in production mode
 * - Check VITE_APP_ENV first (explicit override)
 * - Then check Vite's mode
 * - Then check hostname
 */
export function isProduction(): boolean {
    // Explicit env var takes precedence
    if (import.meta.env.VITE_APP_ENV === 'production') return true;
    if (import.meta.env.VITE_APP_ENV === 'development') return false;

    // Vite's mode (set by vite build vs vite dev)
    if (import.meta.env.MODE === 'production') return true;
    if (import.meta.env.MODE === 'development') return false;

    // Hostname detection as fallback
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        return hostname !== 'localhost' && hostname !== '127.0.0.1';
    }

    return false;
}

/**
 * Get the backend API base URL
 * Priority: VITE_BACKEND_URL > auto-detect based on environment
 */
export function getBackendUrl(): string {
    // Explicit env var takes precedence
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }

    // Auto-detect based on environment
    return isProduction() ? PRODUCTION_BACKEND_URL : DEVELOPMENT_BACKEND_URL;
}

// =============================================================================
// EXPORTED CONFIG OBJECT
// =============================================================================

export const config = {
    contractAddress: MEGAPLACE_ADDRESS,
    // Environment
    isProduction: isProduction(),
    mode: import.meta.env.MODE,

    // Backend API
    backendUrl: getBackendUrl(),

    // Feature flags
    enableSSE: true, // Server-Sent Events for real-time updates
    enableBinaryFormat: true, // Binary pixel format for faster loads
} as const;

// Note: Contract configuration (address, chain, RPC) is in src/contracts/config.ts

// Log config in development
if (!isProduction()) {
    console.log('[Config] Environment:', config.mode);
    console.log('[Config] Backend URL:', config.backendUrl);
    console.log('[Config] Contract:', config.contractAddress);
}

export default config;

