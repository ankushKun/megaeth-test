import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import { EventListener, PixelData } from './eventListener.js';

export function createApp(eventListener: EventListener) {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(compression());
    app.use(express.json());

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        const stats = eventListener.getStats();
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            ...stats,
        });
    });

    // Get all pixels
    app.get('/api/pixels', (req: Request, res: Response) => {
        try {
            const pixels = eventListener.getPixels();
            const pixelArray = Object.values(pixels);

            res.json({
                success: true,
                count: pixelArray.length,
                pixels: pixelArray,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to fetch pixels',
            });
        }
    });

    // Get pixel at specific coordinates
    app.get('/api/pixels/:x/:y', (req: Request, res: Response) => {
        try {
            const x = parseInt(req.params.x);
            const y = parseInt(req.params.y);

            if (isNaN(x) || isNaN(y)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid coordinates',
                });
            }

            const pixel = eventListener.getPixel(x, y);

            if (!pixel) {
                return res.status(404).json({
                    success: false,
                    error: 'Pixel not found',
                });
            }

            res.json({
                success: true,
                pixel,
            });
        } catch (error) {
            console.error('Error fetching pixel:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch pixel',
            });
        }
    });

    // Get pixels in a region
    app.get('/api/pixels/region/:startX/:startY/:width/:height', (req: Request, res: Response) => {
        try {
            const startX = parseInt(req.params.startX);
            const startY = parseInt(req.params.startY);
            const width = parseInt(req.params.width);
            const height = parseInt(req.params.height);

            if (isNaN(startX) || isNaN(startY) || isNaN(width) || isNaN(height)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid parameters',
                });
            }

            if (width > 1000 || height > 1000) {
                return res.status(400).json({
                    success: false,
                    error: 'Region too large (max 1000x1000)',
                });
            }

            const pixels: PixelData[] = [];
            const allPixels = eventListener.getPixels();

            // Find pixels in the specified region
            for (let y = startY; y < startY + height; y++) {
                for (let x = startX; x < startX + width; x++) {
                    const key = `${x},${y}`;
                    if (allPixels[key]) {
                        pixels.push(allPixels[key]);
                    }
                }
            }

            res.json({
                success: true,
                count: pixels.length,
                pixels,
            });
        } catch (error) {
            console.error('Error fetching region:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch region',
            });
        }
    });

    // Get stats
    app.get('/api/stats', (req: Request, res: Response) => {
        try {
            const stats = eventListener.getStats();
            res.json({
                success: true,
                ...stats,
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch stats',
            });
        }
    });

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            success: false,
            error: 'Endpoint not found',
        });
    });

    return app;
}
