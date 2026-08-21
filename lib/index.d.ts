/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { createServer } from 'node:http';
/** Replaceable Node boundary for deterministic listener lifecycle tests. */
export declare const internals: {
    createServer: typeof createServer;
};
/** Persisted OAuth credential. */
export interface OpenAICodexCredential {
    access: string;
    refresh: string;
    expires: number;
    accountId: string;
}
export interface Config {
    path?: string;
    dshHome?: string;
}
interface UsageWindow {
    usedPercent: number;
    windowSeconds?: number;
    resetAt?: number;
}
interface UsageSummary {
    planType?: string;
    primary?: UsageWindow;
    secondary?: UsageWindow;
    limitReached?: boolean;
    resetCredits?: number;
    fetchedAt: number;
}
/** Reduce the OpenAI response to the stable fields displayed by the Web card. */
export declare function normalizeUsage(value: unknown): UsageSummary;
declare module '@deepseek-ai/cordis' {
    interface Context {
        openaiCodexAuth: OpenAICodexAuth;
    }
}
/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
export declare class OpenAICodexAuth extends Service {
    static Config: z<Config>;
    static inject: string[];
    private readonly filename;
    private readonly csrf;
    private usageCache;
    private usageError;
    private controlServerStart;
    private controlServerRequested;
    private controlServerStop;
    private loginFlow;
    private lastLoginError;
    constructor(ctx: Context, config: Config);
    /** Return a valid bearer token, refreshing and persisting it when near expiry. */
    bearerToken(signal?: AbortSignal): Promise<string | undefined>;
    private createLoginRequest;
    private finishLogin;
    private logout;
    private beginBrowserLogin;
    private status;
    private fetchUsage;
    private ensureControlServer;
    private stopControlServer;
    private startControlServer;
    private controlRequest;
    private write;
    private waitForCallback;
}
export default OpenAICodexAuth;
