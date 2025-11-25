import dotenv from 'dotenv';
import { createApp } from './app.js';
import { EventListener } from './eventListener.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;

async function main() {
    try {
        // Initialize event listener
        const eventListener = new EventListener();

        // Start API server immediately
        const app = createApp(eventListener);

        app.listen(PORT, () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`  🚀 API Server listening on port ${PORT}`);
            console.log(`  📍 http://localhost:${PORT}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            console.log('Endpoints:');
            console.log(`  GET  /health`);
            console.log(`  GET  /api/stats`);
            console.log(`  GET  /api/pixels`);
            console.log(`  GET  /api/pixels/:x/:y`);
            console.log(`  GET  /api/pixels/region/:startX/:startY/:width/:height`);
            console.log();
        });

        // Initialize event listener in background (load storage, sync, watch)
        eventListener.initialize().catch(err => {
            console.error('Failed to initialize event listener:', err);
        });

        // Graceful shutdown
        const shutdown = async () => {
            console.log('\n\n=== Shutting down gracefully ===');
            eventListener.stopWatching();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();
