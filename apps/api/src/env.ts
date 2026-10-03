export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    UNIVERSE: DurableObjectNamespace;
    PRIVATE_BUCKET: R2Bucket;
    PUBLIC_BUCKET: R2Bucket;
    GENERATE_QUEUE: Queue;
    PUBLISH_QUEUE: Queue;
    TRUTH_QUEUE: Queue;
    METRICS: AnalyticsEngineDataset;
    APP_ENV: string;
    PUBLIC_CDN_BASE: string;
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET?: string;
    TWITTER_CLIENT_ID?: string;
    TWITTER_CLIENT_SECRET?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    X_CONSUMER_KEY?: string;
    X_CONSUMER_SECRET?: string;
    X_BEARER_TOKEN?: string;
}

export type AppVariables = {
    requestId: string;
    userId: string | null;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
