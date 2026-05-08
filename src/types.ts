import type { D1Database } from '@cloudflare/workers-types';

export interface Bindings {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    ADMIN_PASSWORD: string;
    ENVIRONMENT: string;
}

export interface AppEnv {
    Bindings: Bindings;
}
