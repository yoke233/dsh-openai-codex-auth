import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands/types'
import { describe, expect, it, vi } from 'vitest'
import { internals, latestCodexClientVersion, normalizeModels, normalizeUsage, OpenAICodexAuth } from '../src/index.ts'

describe('TUI command', () => {
  it('registers login-codex without starting the Web control server', async () => {
    const commands = new Map<string, CommandDefinition>()
    const home = mkdtempSync(join(tmpdir(), 'dsh-codex-auth-'))
    const ctx = new Context()
    const close = vi.fn()
    const originalCreateServer = internals.createServer
    internals.createServer = ((handler) => {
      const server = {
        once: vi.fn().mockReturnThis(),
        removeListener: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        listen: vi.fn((_port, _host, ready) => {
          ready()
          return server
        }),
        close,
      }
      void handler
      return server
    }) as never
    const register = vi.fn((definition: CommandDefinition) => {
      commands.set(definition.name, definition)
      return () => {}
    })
    ctx.provide('credentials', { set: vi.fn(), unset: vi.fn() } as never)
    ctx.provide('commands', { register } as never)
    try {
      await ctx.plugin(OpenAICodexAuth, { dshHome: home })
      expect(register).toHaveBeenCalledWith(expect.objectContaining({
        name: 'login-codex',
        description: expect.any(String),
        handler: expect.any(Function),
      }))
      const result = await commands.get('login-codex')?.handler({} as never)
      expect(result).toMatchObject({
        kind: 'success',
        text: expect.stringContaining('https://auth.openai.com/oauth/authorize'),
      })
      expect(close).not.toHaveBeenCalled()
    } finally {
      internals.createServer = originalCreateServer
      await ctx.fiber.dispose()
      rmSync(home, { recursive: true, force: true })
    }
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('model synchronization', () => {
  it('queries the latest Codex version before fetching and storing models', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-codex-models-'))
    writeFileSync(join(home, 'openai-codex-auth.json'), JSON.stringify({
      version: 1,
      credential: { access: 'access', refresh: 'refresh', expires: Date.now() + 3_600_000, accountId: 'account' },
    }))
    const originalFetch = internals.fetch
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '0.153.4' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{
        slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', visibility: 'list', context_window: 272_000,
        input_modalities: ['text', 'image'], supported_reasoning_levels: [{ effort: 'high' }],
      }] })))
    internals.fetch = fetch as typeof internals.fetch
    const update = vi.fn(async () => {})
    const ctx = new Context()
    ctx.provide('credentials', { set: vi.fn(), unset: vi.fn() } as never)
    ctx.provide('commands', { register: vi.fn(() => () => {}) } as never)
    ctx.provide('settings', { update } as never)
    try {
      await ctx.plugin(OpenAICodexAuth, { dshHome: home })
      await expect(Promise.all([
        ctx.openaiCodexAuth.refreshModels(),
        ctx.openaiCodexAuth.refreshModels(),
      ])).resolves.toEqual([
        [expect.objectContaining({ id: 'gpt-5.6-sol' })],
        [expect.objectContaining({ id: 'gpt-5.6-sol' })],
      ])
      expect(fetch.mock.calls.map(call => call[0])).toEqual([
        'https://registry.npmjs.org/@openai%2Fcodex/latest',
        'https://chatgpt.com/backend-api/codex/models?client_version=0.153.4',
      ])
      expect(update).toHaveBeenCalledWith('llm-pi-ai', { providers: { 'openai-codex': {
        models: [expect.objectContaining({ id: 'gpt-5.6-sol' })],
      } } })
    } finally {
      internals.fetch = originalFetch
      await ctx.fiber.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('Web control lifecycle', () => {
  it('starts on a wake request and stops after the one control request', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-codex-auth-web-'))
    const ctx = new Context()
    const originalCreateServer = internals.createServer
    let route: WebRoute | undefined
    let listener: ((request: IncomingMessage, response: ServerResponse) => void) | undefined
    const close = vi.fn()
    const fakeCreateServer: typeof internals.createServer = ((handler) => {
      listener = handler
      const server = {
        once: vi.fn().mockReturnThis(),
        removeListener: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        listen: vi.fn((_port, _host, ready) => {
          ready()
          return server
        }),
        close,
      }
      return server
    }) as never
    internals.createServer = fakeCreateServer
    ctx.provide('credentials', { set: vi.fn(), unset: vi.fn() } as never)
    ctx.provide('commands', { register: vi.fn(() => () => {}) } as never)
    ctx.provide('webServer', {
      register: vi.fn((candidate: WebRoute) => {
        route = candidate
        return () => {}
      }),
    } as never)
    try {
      await ctx.plugin(OpenAICodexAuth, { dshHome: home })
      const wakeResponse = {
        writeHead: vi.fn().mockReturnThis(),
        end: vi.fn().mockReturnThis(),
      } as never
      await route?.handler({ method: 'POST' } as IncomingMessage, wakeResponse)
      expect(close).not.toHaveBeenCalled()

      const controlResponse = {
        writeHead: vi.fn().mockReturnThis(),
        end: vi.fn().mockReturnThis(),
      } as never
      listener?.({
        method: 'GET',
        url: '/status',
        headers: { origin: 'http://127.0.0.1:3080' },
      } as IncomingMessage, controlResponse)
      await vi.waitFor(() => { expect(close).toHaveBeenCalledOnce() })
    } finally {
      internals.createServer = originalCreateServer
      await ctx.fiber.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('normalizeUsage', () => {
  it('projects the Codex rate-limit response used by the settings card', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    expect(normalizeUsage({
      plan_type: 'plus',
      rate_limit: {
        limit_reached: false,
        primary_window: { used_percent: 42, limit_window_seconds: 18_000, reset_at: 2000 },
        secondary_window: { used_percent: 73, limit_window_seconds: 604_800, reset_at: 3000 },
      },
      rate_limit_reset_credits: { available_count: 2 },
    })).toEqual({
      planType: 'plus',
      primary: { usedPercent: 42, windowSeconds: 18_000, resetAt: 2000 },
      secondary: { usedPercent: 73, windowSeconds: 604_800, resetAt: 3000 },
      limitReached: false,
      resetCredits: 2,
      fetchedAt: 1234,
    })
    vi.restoreAllMocks()
  })

  it('clamps malformed percentages and tolerates absent windows', () => {
    expect(normalizeUsage({ rate_limit: { primary_window: { used_percent: 120 } } }).primary)
      .toEqual({ usedPercent: 100 })
  })
})

describe('latestCodexClientVersion', () => {
  it('reads the latest official package version on every call', async () => {
    const originalFetch = internals.fetch
    const fetch = vi.fn(async () => new Response(JSON.stringify({ version: '0.153.4' })))
    internals.fetch = fetch as typeof internals.fetch
    try {
      await expect(latestCodexClientVersion()).resolves.toBe('0.153.4')
      await expect(latestCodexClientVersion()).resolves.toBe('0.153.4')
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@openai%2Fcodex/latest',
        expect.objectContaining({ cache: 'no-store' }),
      )
    } finally {
      internals.fetch = originalFetch
    }
  })

  it('refuses malformed registry metadata', async () => {
    const originalFetch = internals.fetch
    internals.fetch = vi.fn(async () => new Response(JSON.stringify({ version: 'latest' }))) as typeof internals.fetch
    try {
      await expect(latestCodexClientVersion()).rejects.toThrow('version response is invalid')
    } finally {
      internals.fetch = originalFetch
    }
  })
})

describe('normalizeModels', () => {
  it('projects visible account models into DSH profiles', () => {
    expect(normalizeModels({
      models: [
        {
          slug: 'gpt-next',
          display_name: 'GPT Next',
          visibility: 'list',
          context_window: 272_000,
          input_modalities: ['text', 'image', 'audio'],
          supported_reasoning_levels: [
            { effort: 'low' },
            { effort: 'xhigh' },
            { effort: 'ultra' },
          ],
        },
        { slug: 'internal-review', visibility: 'hide' },
      ],
    })).toEqual([{
      id: 'gpt-next',
      name: 'GPT Next',
      contextWindow: 272_000,
      input: ['text', 'image'],
      reasoningEfforts: { low: 'low', xhigh: 'xhigh' },
    }])
  })


  it('refuses an empty or malformed catalog instead of erasing configured models', () => {
    expect(() => normalizeModels({ models: [{ visibility: 'hide', slug: 'hidden' }] })).toThrow('no visible models')
    expect(() => normalizeModels({})).toThrow('models array')
  })
})
