import { Hono } from 'hono';
import type { AppEnv } from '../types';

export const apiRoutes = new Hono<AppEnv>();

apiRoutes.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: Date.now(),
        environment: c.env.ENVIRONMENT
    });
});
