import type { D1Database } from '@cloudflare/workers-types';

export interface Bindings {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    AUTH_SECRET: string;
    ADMIN_PASSWORD: string;
    ENVIRONMENT: string;
}

export interface AppEnv {
    Bindings: Bindings;
}
