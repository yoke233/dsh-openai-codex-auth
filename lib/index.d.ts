/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Persisted OAuth credential. */
export interface OpenAICodexCredential {
    access: string;
    refresh: string;
    expires: number;
    accountId: string;
}
/** Plugin configuration. */
export interface Config {
    path?: string;
    dshHome?: string;
    controlServer?: boolean;
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
    private startControlServer;
    private controlRequest;
    private write;
    private waitForCallback;
}
export default OpenAICodexAuth;
