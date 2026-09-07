/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const DEFAULT_FILENAME = 'openai-codex-auth.json';
const TOKEN_REF = credentialRef('DSH_OPENAI_CODEX_TOKEN');
const CONTROL_PORT = 1456;
const CODEX_LATEST_VERSION_URL = 'https://registry.npmjs.org/@openai%2Fcodex/latest';
const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models';
const MODEL_SYNC_TIMEOUT_MS = 30_000;
/** Replaceable Node boundaries for deterministic tests. */
export const internals = { createServer, fetch: globalThis.fetch };
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const USAGE_CACHE_MS = 30_000;
function base64Url(value) {
    return value.toString('base64url');
}
function accountId(access) {
    const parts = access.split('.');
    if (parts.length !== 3)
        throw new Error('OpenAI returned an invalid access token');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const id = payload['https://api.openai.com/auth']?.chatgpt_account_id;
    if (typeof id !== 'string' || id.length === 0)
        throw new Error('OpenAI token has no ChatGPT account id');
    return id;
}
function parseCredential(text, filename) {
    const value = JSON.parse(text);
    const credential = value.credential;
    if (value.version !== 1 || credential === undefined
        || typeof credential.access !== 'string' || typeof credential.refresh !== 'string'
        || typeof credential.expires !== 'number' || typeof credential.accountId !== 'string') {
        throw new Error(`openai-codex-auth: invalid credential document ${filename}`);
    }
    return credential;
}
async function readCredential(filename) {
    try {
        return parseCredential(await readFile(filename, 'utf8'), filename);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
async function tokenRequest(body, signal) {
    const response = await internals.fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        ...signal === undefined ? {} : { signal },
    });
    if (!response.ok) {
        throw new Error(`OpenAI token request failed (HTTP ${response.status}): ${await response.text()}`);
    }
    const value = await response.json();
    if (value === null || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string'
        || typeof value.expires_in !== 'number')
        throw new Error('OpenAI token response is incomplete');
    return {
        access: value.access_token,
        refresh: value.refresh_token,
        expires: Date.now() + value.expires_in * 1000,
        accountId: accountId(value.access_token),
    };
}
function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function usageWindow(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const row = value;
    const usedPercent = optionalNumber(row.used_percent ?? row.usedPercent);
    if (usedPercent === undefined)
        return undefined;
    const windowSeconds = optionalNumber(row.limit_window_seconds ?? row.windowDurationSecs);
    const resetAt = optionalNumber(row.reset_at ?? row.resetsAt);
    return {
        usedPercent: Math.max(0, Math.min(100, usedPercent)),
        ...windowSeconds === undefined ? {} : { windowSeconds },
        ...resetAt === undefined ? {} : { resetAt },
    };
}
/** Reduce the OpenAI response to the stable fields displayed by the Web card. */
export function normalizeUsage(value) {
    const root = value !== null && typeof value === 'object' ? value : {};
    const limits = root.rate_limit !== null && typeof root.rate_limit === 'object'
        ? root.rate_limit
        : root.rateLimits !== null && typeof root.rateLimits === 'object'
            ? root.rateLimits
            : {};
    const credits = root.rate_limit_reset_credits !== null && typeof root.rate_limit_reset_credits === 'object'
        ? root.rate_limit_reset_credits
        : undefined;
    const planType = typeof root.plan_type === 'string'
        ? root.plan_type
        : typeof root.planType === 'string' ? root.planType : undefined;
    const primary = usageWindow(limits.primary_window ?? limits.primary);
    const secondary = usageWindow(limits.secondary_window ?? limits.secondary);
    const limitReached = typeof limits.limit_reached === 'boolean'
        ? limits.limit_reached
        : typeof limits.limitReached === 'boolean' ? limits.limitReached : undefined;
    const resetCredits = optionalNumber(credits?.available_count ?? credits?.availableCount);
    return {
        ...planType === undefined ? {} : { planType },
        ...primary === undefined ? {} : { primary },
        ...secondary === undefined ? {} : { secondary },
        ...limitReached === undefined ? {} : { limitReached },
        ...resetCredits === undefined ? {} : { resetCredits },
        fetchedAt: Date.now(),
    };
}
/** Resolve the current official Codex CLI version for model-catalog gating. */
export async function latestCodexClientVersion(signal) {
    const response = await internals.fetch(CODEX_LATEST_VERSION_URL, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-openai-codex-auth/0.3.0' },
        cache: 'no-store',
        ...signal === undefined ? {} : { signal },
    });
    if (!response.ok)
        throw new Error(`Codex version request failed (HTTP ${response.status})`);
    const value = await response.json();
    const version = value?.version;
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error('Codex version response is invalid');
    }
    return version;
}
const REASONING_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
/** Convert an account-specific Codex catalog response into DSH model profiles. */
export function normalizeModels(value) {
    if (value === null || typeof value !== 'object' || !Array.isArray(value.models)) {
        throw new Error('Codex models response does not contain a models array');
    }
    const models = [];
    const seen = new Set();
    for (const candidate of value.models) {
        if (candidate === null || typeof candidate !== 'object')
            continue;
        const row = candidate;
        if (row.visibility === 'hide' || typeof row.slug !== 'string' || row.slug.length === 0 || seen.has(row.slug))
            continue;
        seen.add(row.slug);
        const contextWindow = Number.isSafeInteger(row.context_window) && row.context_window > 0
            ? row.context_window
            : undefined;
        const input = Array.isArray(row.input_modalities)
            ? row.input_modalities.filter((item) => item === 'text' || item === 'image')
            : [];
        const reasoningEfforts = {};
        if (Array.isArray(row.supported_reasoning_levels)) {
            for (const candidateLevel of row.supported_reasoning_levels) {
                if (candidateLevel === null || typeof candidateLevel !== 'object')
                    continue;
                const effort = candidateLevel.effort;
                if (effort === 'none' || effort === 'off')
                    reasoningEfforts.off = null;
                else if (typeof effort === 'string' && REASONING_LEVELS.has(effort)) {
                    reasoningEfforts[effort] = effort;
                }
            }
        }
        models.push({
            id: row.slug,
            ...typeof row.display_name === 'string' && row.display_name.length > 0 ? { name: row.display_name } : {},
            ...contextWindow === undefined ? {} : { contextWindow },
            ...input.length === 0 ? {} : { input },
            ...Object.keys(reasoningEfforts).length === 0 ? {} : { reasoningEfforts },
        });
    }
    if (models.length === 0)
        throw new Error('Codex models response contains no visible models');
    return models;
}
function isLocalOrigin(origin) {
    if (origin === undefined)
        return false;
    try {
        const hostname = new URL(origin).hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    }
    catch {
        return false;
    }
}
/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
export class OpenAICodexAuth extends Service {
    static Config = z.object({ path: z.string(), dshHome: z.string() });
    static inject = ['credentials', 'commands'];
    filename;
    csrf = base64Url(randomBytes(24));
    usageCache;
    usageError;
    modelCache;
    modelError;
    modelRefresh;
    controlServerStart;
    controlServerRequested = false;
    controlServerStop;
    loginFlow;
    lastLoginError;
    constructor(ctx, config) {
        super(ctx, 'openaiCodexAuth');
        this.filename = resolve(config.path ?? join(resolveDshHome(config.dshHome), DEFAULT_FILENAME));
        ctx.effect(async () => {
            const token = await this.bearerToken();
            if (token !== undefined)
                await ctx.credentials.set(TOKEN_REF, token);
            return () => { };
        });
        ctx.effect(() => {
            const timer = setInterval(() => { void this.bearerToken().catch(() => { }); }, 60_000);
            return () => { clearInterval(timer); };
        });
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => webCtx.webServer.register({
                kind: 'exact',
                path: '/api/plugins/openai-codex-auth/control',
                handler: async (request, response) => {
                    if (request.method !== 'POST') {
                        response.writeHead(405, { allow: 'POST' }).end();
                        return;
                    }
                    await this.ensureControlServer();
                    response.writeHead(204, { 'cache-control': 'no-store' }).end();
                },
            }));
        });
        ctx.effect(() => () => {
            this.loginFlow?.abort.abort();
            this.stopControlServer();
        });
        ctx.effect(() => ctx.commands.register({
            name: 'login-codex',
            description: '登录 OpenAI Codex 订阅账号',
            handler: () => {
                const flow = this.beginBrowserLogin();
                return {
                    kind: 'success',
                    text: `请在浏览器打开以下链接完成 OpenAI 登录：\n\n${flow.url}\n\n授权完成后，Codex 凭据会自动生效。`,
                };
            },
        }));
        ctx.effect(() => ctx.commands.register({
            name: 'refresh-codex-models',
            description: '从 OpenAI 刷新当前账号可用的 Codex 模型',
            handler: async () => {
                try {
                    const models = await this.refreshModels();
                    return { kind: 'success', text: `已更新 ${models.length} 个 Codex 模型：${models.map(model => model.id).join('、')}` };
                }
                catch (error) {
                    return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
                }
            },
        }));
    }
    /** Return a valid bearer token, refreshing and persisting it when near expiry. */
    async bearerToken(signal) {
        return withFileLock(this.filename, async () => {
            const current = await readCredential(this.filename);
            if (current === undefined)
                return undefined;
            if (current.expires > Date.now() + 60_000)
                return current.access;
            const next = await tokenRequest(new URLSearchParams({
                grant_type: 'refresh_token', refresh_token: current.refresh, client_id: CLIENT_ID,
            }), signal);
            await this.write(next);
            await this.ctx.credentials.set(TOKEN_REF, next.access);
            return next.access;
        });
    }
    /** Fetch this account's visible Codex catalog and publish it to DSH. */
    async refreshModels(signal) {
        if (this.modelRefresh !== undefined)
            return this.modelRefresh;
        const timeout = AbortSignal.timeout(MODEL_SYNC_TIMEOUT_MS);
        const requestSignal = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
        const pending = this.performModelRefresh(requestSignal);
        this.modelRefresh = pending;
        try {
            return await pending;
        }
        finally {
            if (this.modelRefresh === pending)
                this.modelRefresh = undefined;
        }
    }
    async performModelRefresh(signal) {
        try {
            let credential = await readCredential(this.filename);
            if (credential === undefined)
                throw new Error('OpenAI login is missing');
            const accountId = credential.accountId;
            const access = await this.bearerToken(signal);
            if (access === undefined)
                throw new Error('OpenAI login is missing');
            credential = await readCredential(this.filename) ?? credential;
            const clientVersion = await latestCodexClientVersion(signal);
            const modelsUrl = `${CODEX_MODELS_URL}?client_version=${encodeURIComponent(clientVersion)}`;
            const response = await internals.fetch(modelsUrl, {
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${access}`,
                    'chatgpt-account-id': credential.accountId,
                    originator: 'deepseek-harness',
                    'user-agent': 'dsh-openai-codex-auth/0.3.0',
                },
                signal,
            });
            if (!response.ok)
                throw new Error(`Codex models request failed (HTTP ${response.status})`);
            const models = normalizeModels(await response.json());
            const active = await readCredential(this.filename);
            if (active?.accountId !== accountId)
                throw new Error('OpenAI account changed during model synchronization');
            const settings = this.ctx.get('settings');
            if (settings === undefined)
                throw new Error('DSH settings service is unavailable');
            await settings.update('llm-pi-ai', { providers: { 'openai-codex': { models } } });
            this.modelCache = { models, clientVersion, fetchedAt: Date.now() };
            this.modelError = undefined;
            return models;
        }
        catch (error) {
            this.modelError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }
    createLoginRequest(signal) {
        const verifier = base64Url(randomBytes(32));
        const challenge = base64Url(createHash('sha256').update(verifier).digest());
        const state = randomBytes(16).toString('hex');
        const url = new URL(AUTHORIZE_URL);
        for (const [key, value] of Object.entries({
            response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
            scope: 'openid profile email offline_access', code_challenge: challenge,
            code_challenge_method: 'S256', state, id_token_add_organizations: 'true',
            codex_cli_simplified_flow: 'true', originator: 'deepseek-harness',
        }))
            url.searchParams.set(key, value);
        return { url: url.toString(), code: this.waitForCallback(state, signal), verifier };
    }
    async finishLogin(authorizationCode, verifier, signal) {
        const credential = await tokenRequest(new URLSearchParams({
            grant_type: 'authorization_code', client_id: CLIENT_ID, code: authorizationCode,
            code_verifier: verifier, redirect_uri: REDIRECT_URI,
        }), signal);
        await withFileLock(this.filename, () => this.write(credential));
        await this.ctx.credentials.set(TOKEN_REF, credential.access);
        this.usageCache = undefined;
        this.usageError = undefined;
        void this.refreshModels().catch(() => { });
    }
    async logout() {
        await withFileLock(this.filename, async () => {
            try {
                await unlink(this.filename);
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
        });
        await this.ctx.credentials.unset(TOKEN_REF);
        this.usageCache = undefined;
        this.usageError = undefined;
        this.modelCache = undefined;
        this.modelError = undefined;
    }
    beginBrowserLogin() {
        if (this.loginFlow !== undefined)
            return this.loginFlow;
        const abort = new AbortController();
        const { url, code, verifier } = this.createLoginRequest(abort.signal);
        this.lastLoginError = undefined;
        const completion = code
            .then(authorizationCode => this.finishLogin(authorizationCode, verifier, abort.signal))
            .catch((error) => { this.lastLoginError = error instanceof Error ? error.message : String(error); })
            .finally(() => { this.loginFlow = undefined; });
        const flow = { url, completion, abort };
        this.loginFlow = flow;
        return flow;
    }
    async status(refresh) {
        let credential = await readCredential(this.filename);
        if (credential === undefined) {
            return { loggedIn: false, loginPending: this.loginFlow !== undefined, loginError: this.lastLoginError, csrf: this.csrf };
        }
        try {
            await this.bearerToken();
            credential = await readCredential(this.filename) ?? credential;
        }
        catch (error) {
            this.usageError = error instanceof Error ? error.message : String(error);
        }
        if (refresh || this.usageCache === undefined || Date.now() - this.usageCache.fetchedAt > USAGE_CACHE_MS) {
            try {
                this.usageCache = await this.fetchUsage(credential);
                this.usageError = undefined;
            }
            catch (error) {
                this.usageError = error instanceof Error ? error.message : String(error);
            }
        }
        return {
            loggedIn: true,
            loginPending: this.loginFlow !== undefined,
            accountId: credential.accountId,
            expiresAt: credential.expires,
            usage: this.usageCache,
            usageError: this.usageError,
            models: this.modelCache,
            modelError: this.modelError,
            csrf: this.csrf,
        };
    }
    async fetchUsage(credential) {
        const access = await this.bearerToken();
        if (access === undefined)
            throw new Error('OpenAI login is missing');
        const response = await internals.fetch(USAGE_URL, {
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${access}`,
                'chatgpt-account-id': credential.accountId,
                'user-agent': 'dsh-openai-codex-auth/0.3.0',
            },
        });
        if (!response.ok)
            throw new Error(`Codex usage request failed (HTTP ${response.status})`);
        return normalizeUsage(await response.json());
    }
    async ensureControlServer() {
        this.controlServerRequested = true;
        if (this.controlServerStop !== undefined)
            return;
        if (this.controlServerStart !== undefined)
            return this.controlServerStart;
        const start = this.startControlServer().then((stop) => {
            if (this.controlServerRequested)
                this.controlServerStop = stop;
            else
                stop();
        });
        this.controlServerStart = start;
        try {
            await start;
        }
        finally {
            if (this.controlServerStart === start)
                this.controlServerStart = undefined;
        }
    }
    stopControlServer() {
        this.controlServerRequested = false;
        const stop = this.controlServerStop;
        this.controlServerStop = undefined;
        stop?.();
    }
    startControlServer() {
        return new Promise((resolveStart, rejectStart) => {
            const server = internals.createServer((request, response) => { void this.controlRequest(request, response); });
            server.once('error', rejectStart);
            server.listen(CONTROL_PORT, '127.0.0.1', () => {
                server.removeListener('error', rejectStart);
                resolveStart(() => {
                    this.loginFlow?.abort.abort();
                    server.close();
                });
            });
        });
    }
    async controlRequest(request, response) {
        const origin = request.headers.origin;
        const localOrigin = isLocalOrigin(origin);
        const headers = {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            vary: 'Origin',
            ...localOrigin ? { 'access-control-allow-origin': origin } : {},
        };
        const send = (status, value) => {
            response.writeHead(status, headers).end(JSON.stringify(value));
        };
        try {
            const url = new URL(request.url ?? '/', `http://127.0.0.1:${CONTROL_PORT}`);
            if (request.method === 'OPTIONS' && localOrigin) {
                response.writeHead(204, {
                    ...headers,
                    'access-control-allow-methods': 'GET, POST, OPTIONS',
                    'access-control-allow-headers': 'content-type, x-dsh-csrf',
                }).end();
                return;
            }
            if (url.pathname === '/start' && request.method === 'GET') {
                const flow = this.beginBrowserLogin();
                void flow.completion.finally(() => { this.stopControlServer(); });
                response.writeHead(302, { location: flow.url, 'cache-control': 'no-store' }).end();
                return;
            }
            if (!localOrigin) {
                send(403, { error: 'This endpoint only accepts a local DSH Web origin.' });
                return;
            }
            if (url.pathname === '/status' && request.method === 'GET') {
                send(200, await this.status(url.searchParams.get('refresh') === '1'));
                return;
            }
            if (url.pathname === '/models' && request.method === 'POST') {
                if (request.headers['x-dsh-csrf'] !== this.csrf) {
                    send(403, { error: 'Invalid CSRF token.' });
                    return;
                }
                const models = await this.refreshModels();
                send(200, { models: models.map(model => ({ id: model.id, name: model.name })) });
                return;
            }
            if (url.pathname === '/logout' && request.method === 'POST') {
                if (request.headers['x-dsh-csrf'] !== this.csrf) {
                    send(403, { error: 'Invalid CSRF token.' });
                    return;
                }
                await this.logout();
                send(200, { ok: true });
                return;
            }
            send(404, { error: 'Not found' });
        }
        catch (error) {
            send(500, { error: error instanceof Error ? error.message : String(error) });
        }
        finally {
            if (this.loginFlow === undefined)
                setImmediate(() => { this.stopControlServer(); });
        }
    }
    write(credential) {
        return writeFileAtomic(this.filename, `${JSON.stringify({ version: 1, credential }, null, 2)}\n`, {
            mode: 0o600, dirMode: 0o700,
        });
    }
    waitForCallback(state, signal) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const server = internals.createServer((request, response) => {
                const url = new URL(request.url ?? '', REDIRECT_URI);
                if (url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
                    response.writeHead(400).end('Invalid OpenAI OAuth callback.');
                    return;
                }
                const code = url.searchParams.get('code');
                if (code === null) {
                    response.writeHead(400).end('Missing authorization code.');
                    return;
                }
                response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('OpenAI login complete. You may close this window.');
                settled = true;
                signal.removeEventListener('abort', abort);
                server.close();
                resolve(code);
            });
            const abort = () => {
                if (settled)
                    return;
                settled = true;
                server.close();
                reject(new Error('OpenAI login cancelled'));
            };
            signal.addEventListener('abort', abort, { once: true });
            server.listen(1455, '127.0.0.1').on('error', (error) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', abort);
                reject(error);
            });
        });
    }
}
export default OpenAICodexAuth;
