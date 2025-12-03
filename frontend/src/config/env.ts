/**
 * Environment configuration for MegaPlace frontend
 * All config from .env - no hardcoded fallbacks
 */

import { MEGAPLACE_ADDRESS } from "@/contracts/config";

// =============================================================================
// BACKEND CONFIGURATION (from .env)
// =============================================================================

const PRODUCTION_BACKEND_URL = import.meta.env.VITE_BACKEND_URL_PROD;
const DEVELOPMENT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL_DEV;

/**
 * Detect if we're in production mode
 * Based on Vite's mode (set by vite build vs vite dev)
 */
export function isProduction(): boolean {
    return import.meta.env.MODE === 'production';
}

/**
 * Get the backend API base URL based on environment
 */
export function getBackendUrl(): string {
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

