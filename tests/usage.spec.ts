import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { normalizeUsage, OpenAICodexAuth } from '../src/index.ts'

describe('TUI command', () => {
  it('registers login-codex without starting the Web control server', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-codex-auth-'))
    const ctx = new Context()
    const register = vi.fn(() => () => {})
    ctx.provide('credentials', { set: vi.fn(), unset: vi.fn() } as never)
    ctx.provide('commands', { register } as never)
    try {
      await ctx.plugin(OpenAICodexAuth, { dshHome: home, controlServer: false })
      expect(register).toHaveBeenCalledWith(expect.objectContaining({
        name: 'login-codex',
        description: expect.any(String),
        handler: expect.any(Function),
      }))
    } finally {
      await ctx.fiber.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('plugin config', () => {
  it('keeps the local control server opt-in', () => {
    expect(OpenAICodexAuth.Config({})).toMatchObject({ controlServer: false })
    expect(OpenAICodexAuth.Config({ controlServer: true })).toMatchObject({ controlServer: true })
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
