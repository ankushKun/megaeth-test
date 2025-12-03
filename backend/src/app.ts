import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import { EventListener, PixelData } from './eventListener.js';

// Validation helpers
function isValidCoordinate(value: unknown): value is number {
    const num = Number(value);
    return !isNaN(num) && Number.isInteger(num) && num >= 0 && num < 1048576;
}

function isValidDimension(value: unknown, max: number = 1000): value is number {
    const num = Number(value);
    return !isNaN(num) && Number.isInteger(num) && num > 0 && num <= max;
}

function isValidPaginationParam(value: unknown, max: number = 100000): value is number {
    const num = Number(value);
    return !isNaN(num) && Number.isInteger(num) && num >= 0 && num <= max;
}

// Error response helper
function errorResponse(res: Response, status: number, message: string) {
    return res.status(status).json({
        success: false,
        error: message,
    });
}

export function createApp(eventListener: EventListener) {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(compression({ level: 6 })); // Balanced compression
    app.use(express.json());

    // Request logging middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (duration > 100) {
                console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
            }
        });
        next();
    });

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        const stats = eventListener.getStats();
        const memoryUsage = process.memoryUsage();

        res.json({
            status: stats.isWatching ? 'healthy' : 'degraded',
            uptime: process.uptime(),
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
            },
            ...stats,
        });
    });

    // ===== SSE: Server-Sent Events for real-time pixel updates =====
    app.get('/api/pixels/stream', (req: Request, res: Response) => {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.flushHeaders();

        console.log('📡 SSE client connected');

        // Send initial connection message
        res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to pixel stream' })}\n\n`);

        // Register callback for new pixels
        const unsubscribe = eventListener.onPixel((pixel: PixelData) => {
            const data = JSON.stringify(pixel);
            res.write(`event: pixel\ndata: ${data}\n\n`);
        });

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeat = setInterval(() => {
            res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        }, 30000);

        // Cleanup on disconnect
        req.on('close', () => {
            console.log('📡 SSE client disconnected');
            unsubscribe();
            clearInterval(heartbeat);
        });
    });

    // ===== Binary format: Compact pixel data =====
    // Returns: [x (4 bytes), y (4 bytes), color (4 bytes)] per pixel = 12 bytes each
    // ~10x smaller than JSON for large datasets
    app.get('/api/pixels/binary', (req: Request, res: Response) => {
        try {
            const buffer = eventListener.getPixelsBinary();

            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Length', buffer.length.toString());
            res.set('X-Pixel-Count', (buffer.length / 12).toString());
            res.set('Cache-Control', 'public, max-age=5');

            res.send(buffer);
        } catch (error) {
            console.error('Error getting binary pixels:', error);
            return errorResponse(res, 500, 'Failed to get binary pixels');
        }
    });

    // ===== Get all pixels with optional pagination =====
    app.get('/api/pixels', (req: Request, res: Response) => {
        try {
            const { limit, offset } = req.query;

            // Validate pagination params if provided
            if (limit !== undefined && !isValidPaginationParam(limit, 100000)) {
                return errorResponse(res, 400, 'Invalid limit. Must be 0-100000.');
            }
            if (offset !== undefined && !isValidPaginationParam(offset, 10000000)) {
                return errorResponse(res, 400, 'Invalid offset. Must be 0-10000000.');
            }

            const stats = eventListener.getStats();
            const limitNum = limit !== undefined ? Number(limit) : undefined;
            const offsetNum = offset !== undefined ? Number(offset) : undefined;

            // Use paginated array if params provided, otherwise return all
            const pixelArray = (limitNum !== undefined || offsetNum !== undefined)
                ? eventListener.getPixelsArray(limitNum, offsetNum ?? 0)
                : eventListener.getPixelsArray();

            res.set('Cache-Control', 'public, max-age=5');

            res.json({
                success: true,
                count: pixelArray.length,
                total: stats.totalPixels,
                hasMore: (offsetNum ?? 0) + pixelArray.length < stats.totalPixels,
                pixels: pixelArray,
            });
        } catch (error) {
            console.error('Error fetching pixels:', error);
            return errorResponse(res, 500, 'Failed to fetch pixels');
        }
    });

    // Get pixel at specific coordinates
    app.get('/api/pixels/:x/:y', (req: Request, res: Response) => {
        try {
            const x = parseInt(req.params.x);
            const y = parseInt(req.params.y);

            if (!isValidCoordinate(x) || !isValidCoordinate(y)) {
                return errorResponse(res, 400, 'Invalid coordinates. Must be integers between 0 and 1048575.');
            }

            const pixel = eventListener.getPixel(x, y);

            if (!pixel) {
                return errorResponse(res, 404, 'Pixel not found');
            }

            res.set('Cache-Control', 'public, max-age=2');

            res.json({
                success: true,
                pixel,
            });
        } catch (error) {
            console.error('Error fetching pixel:', error);
            return errorResponse(res, 500, 'Failed to fetch pixel');
        }
    });

    // Get pixels in a region
    app.get('/api/pixels/region/:startX/:startY/:width/:height', (req: Request, res: Response) => {
        try {
            const startX = parseInt(req.params.startX);
            const startY = parseInt(req.params.startY);
            const width = parseInt(req.params.width);
            const height = parseInt(req.params.height);

            if (!isValidCoordinate(startX) || !isValidCoordinate(startY)) {
                return errorResponse(res, 400, 'Invalid start coordinates. Must be integers between 0 and 1048575.');
            }

            if (!isValidDimension(width, 1000) || !isValidDimension(height, 1000)) {
                return errorResponse(res, 400, 'Invalid dimensions. Must be integers between 1 and 1000.');
            }

            if (width * height > 10000) {
                return errorResponse(res, 400, 'Region too large. Maximum 10,000 pixels (e.g., 100x100).');
            }

            const pixels = eventListener.getRegion(startX, startY, width, height);

            res.set('Cache-Control', 'public, max-age=5');

            res.json({
                success: true,
                count: pixels.length,
                pixels,
            });
        } catch (error) {
            console.error('Error fetching region:', error);
            return errorResponse(res, 500, 'Failed to fetch region');
        }
    });

    // Get stats
    app.get('/api/stats', (req: Request, res: Response) => {
        try {
            const stats = eventListener.getStats();

            res.set('Cache-Control', 'public, max-age=10');

            res.json({
                success: true,
                ...stats,
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
            return errorResponse(res, 500, 'Failed to fetch stats');
        }
    });

    // 404 handler
    app.use((req: Request, res: Response) => {
        return errorResponse(res, 404, 'Endpoint not found');
    });

    // Global error handler
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Unhandled error:', err);
        return errorResponse(res, 500, 'Internal server error');
    });

    return app;
}
