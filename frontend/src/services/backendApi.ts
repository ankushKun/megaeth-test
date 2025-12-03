// Backend API service for fetching pixel data
import { config } from '../config/env';

// Use centralized config for backend URL
const BACKEND_URL = config.backendUrl;

// Timeout for health checks
const BACKEND_HEALTH_TIMEOUT_MS = 3000;

export interface BackendPixelData {
    x: number;
    y: number;
    color: number;
    placedBy: string;
    timestamp: number;
}

export interface BackendResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface PixelsResponse {
    success: boolean;
    count: number;
    total: number;
    hasMore: boolean;
    pixels: BackendPixelData[];
}

export interface PixelResponse {
    success: boolean;
    pixel: BackendPixelData;
}

export interface StatsResponse {
    success: boolean;
    totalPixels: number;
    lastProcessedBlock: string;
    isWatching: boolean;
    isSyncing: boolean;
    syncProgress: number;
    connectedClients: number;
}

export interface RegionResponse {
    success: boolean;
    count: number;
    pixels: BackendPixelData[];
}

/**
 * Fetch all pixels from backend using binary format (much faster)
 * Binary format: [x (4 bytes), y (4 bytes), color (4 bytes)] per pixel = 12 bytes each
 */
export async function fetchAllPixelsBinary(): Promise<BackendPixelData[]> {
    if (!config.enableBinaryFormat) {
        return fetchAllPixels();
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/pixels/binary`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const dataView = new DataView(buffer);
        const pixelCount = buffer.byteLength / 12;
        const pixels: BackendPixelData[] = [];

        for (let i = 0; i < pixelCount; i++) {
            const offset = i * 12;
            pixels.push({
                x: dataView.getUint32(offset, true), // little-endian
                y: dataView.getUint32(offset + 4, true),
                color: dataView.getUint32(offset + 8, true),
                placedBy: '', // Not included in binary format for size
                timestamp: 0, // Not included in binary format for size
            });
        }

        console.log(`[Binary] Loaded ${pixels.length} pixels (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
        return pixels;
    } catch (error) {
        console.error('Failed to fetch binary pixels from backend:', error);
        // Fallback to JSON format
        return fetchAllPixels();
    }
}

/**
 * Fetch all pixels from backend (JSON format with full metadata)
 */
export async function fetchAllPixels(): Promise<BackendPixelData[]> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/pixels`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: PixelsResponse = await response.json();
        console.log(`[JSON] Loaded ${data.pixels?.length || 0} pixels`);
        return data.pixels || [];
    } catch (error) {
        console.error('Failed to fetch pixels from backend:', error);
        return [];
    }
}

/**
 * Fetch a specific pixel from backend
 */
export async function fetchPixel(x: number, y: number): Promise<BackendPixelData | null> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/pixels/${x}/${y}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: PixelResponse = await response.json();
        return data.pixel;
    } catch (error) {
        console.error(`Failed to fetch pixel (${x}, ${y}) from backend:`, error);
        return null;
    }
}

/**
 * Fetch pixels in a region from backend
 */
export async function fetchRegion(
    startX: number,
    startY: number,
    width: number,
    height: number
): Promise<BackendPixelData[]> {
    try {
        const response = await fetch(
            `${BACKEND_URL}/api/pixels/region/${startX}/${startY}/${width}/${height}`
        );
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: RegionResponse = await response.json();
        return data.pixels || [];
    } catch (error) {
        console.error(`Failed to fetch region from backend:`, error);
        return [];
    }
}

/**
 * Fetch stats from backend
 */
export async function fetchStats(): Promise<StatsResponse | null> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/stats`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: StatsResponse = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch stats from backend:', error);
        return null;
    }
}

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS),
        });
        return response.ok;
    } catch (error) {
        console.warn('Backend is not available:', error);
        return false;
    }
}

/**
 * Subscribe to real-time pixel updates via Server-Sent Events
 * Returns an unsubscribe function
 */
export function subscribeToPixelStream(
    onPixel: (pixel: BackendPixelData) => void,
    onConnect?: () => void,
    onError?: (error: Event) => void
): () => void {
    if (!config.enableSSE) {
        console.log('[SSE] Disabled by config');
        return () => { };
    }

    const eventSource = new EventSource(`${BACKEND_URL}/api/pixels/stream`);

    eventSource.addEventListener('connected', () => {
        console.log('[SSE] Connected to pixel stream');
        onConnect?.();
    });

    eventSource.addEventListener('pixel', (event) => {
        try {
            const pixel: BackendPixelData = JSON.parse(event.data);
            onPixel(pixel);
        } catch (err) {
            console.error('[SSE] Failed to parse pixel event:', err);
        }
    });

    eventSource.addEventListener('heartbeat', () => {
        // Heartbeat received, connection is alive
    });

    eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        onError?.(error);
    };

    // Return unsubscribe function
    return () => {
        console.log('[SSE] Closing connection');
        eventSource.close();
    };
}

/**
 * Get the current backend URL (useful for debugging)
 */
export function getBackendUrl(): string {
    return BACKEND_URL;
}
