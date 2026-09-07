window.__ModuleLoader__.load({
  id: 'dsh-openai-codex-auth',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useMemo, useState } = React
    const BASE = 'http://127.0.0.1:1456'
    const PLUGIN_ID = 'dsh-openai-codex-auth'
    const WAKE = '/api/plugins/openai-codex-auth/control'

    const css = `
      .codexSection{max-width:760px;padding:24px 28px 40px;color:var(--text-primary,#202124)}
      .codexTitle{margin:0 0 6px;font-size:22px;line-height:1.3;font-weight:650}
      .codexIntro{margin:0 0 20px;color:var(--text-secondary,#6b7280);font-size:14px;line-height:1.65}
      .codexCard{overflow:hidden;border:1px solid var(--border-primary,#e5e7eb);border-radius:16px;background:var(--background-primary,#fff);box-shadow:0 8px 30px rgba(15,23,42,.05)}
      .codexHero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 22px 18px;background:linear-gradient(135deg,rgba(16,185,129,.10),rgba(59,130,246,.07))}
      .codexBrand{display:flex;align-items:center;gap:12px;min-width:0}
      .codexLogo{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:12px;background:#111827;color:#fff;font:700 14px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
      .codexName{margin:0;font-size:17px;font-weight:650}.codexMeta{margin:4px 0 0;color:var(--text-secondary,#667085);font-size:12px;overflow-wrap:anywhere}
      .codexBadge{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600;background:rgba(107,114,128,.12);color:#667085}
      .codexBadge.connected{background:rgba(16,185,129,.13);color:#07835d}.codexBadge.pending{background:rgba(245,158,11,.14);color:#a35f00}
      .codexDot{width:7px;height:7px;border-radius:50%;background:currentColor}
      .codexBody{padding:20px 22px 22px}.codexActions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
      .codexButton{appearance:none;border:1px solid var(--border-primary,#d7dce2);border-radius:9px;background:var(--background-primary,#fff);color:var(--text-primary,#202124);padding:8px 13px;font:600 13px/1.2 inherit;cursor:pointer;transition:.15s ease}
      .codexButton:hover{border-color:#8b96a5;background:var(--background-secondary,#f7f8fa)}.codexButton:disabled{opacity:.5;cursor:not-allowed}
      .codexButton.primary{border-color:#111827;background:#111827;color:#fff}.codexButton.primary:hover{background:#2a3443}.codexButton.danger{color:#c23b3b}
      .codexGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:17px}
      .codexUsage{border:1px solid var(--border-primary,#e5e7eb);border-radius:12px;padding:14px;background:var(--background-secondary,#fafafa)}
      .codexUsageHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexUsageName{font-size:13px;font-weight:600}.codexUsageValue{font-size:12px;color:var(--text-secondary,#667085)}
      .codexBar{height:8px;margin:11px 0 9px;overflow:hidden;border-radius:999px;background:rgba(107,114,128,.16)}.codexBarFill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#10b981,#3b82f6);transition:width .25s ease}.codexBarFill.high{background:linear-gradient(90deg,#f59e0b,#ef4444)}
      .codexReset{font-size:12px;color:var(--text-secondary,#667085)}
      .codexPlan{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}.codexPlan strong{font-size:14px}.codexPlan span{font-size:12px;color:var(--text-secondary,#667085)}
      .codexNotice{margin:15px 0 0;border-radius:10px;padding:10px 12px;background:rgba(59,130,246,.08);color:var(--text-secondary,#526071);font-size:12px;line-height:1.55}
      .codexError{margin:14px 0 0;border-radius:10px;padding:10px 12px;background:rgba(239,68,68,.09);color:#b42318;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
      .codexEmpty{padding:6px 0;color:var(--text-secondary,#667085);font-size:13px;line-height:1.6}.codexSkeleton{height:9px;margin:10px 0;border-radius:99px;background:linear-gradient(90deg,#eee,#f7f7f7,#eee);background-size:200% 100%;animation:codexPulse 1.2s infinite}
      @keyframes codexPulse{to{background-position:-200% 0}}@media(max-width:620px){.codexSection{padding:18px 15px 30px}.codexHero{padding:18px;flex-direction:column}.codexBody{padding:17px 18px 20px}.codexGrid{grid-template-columns:1fr}}
    `
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="' + PLUGIN_ID + '"]') === null) {
      const style = document.createElement('style')
      style.dataset.plugin = PLUGIN_ID
      style.textContent = css
      document.head.appendChild(style)
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function shortAccount(value) {
      if (!value) return ''
      return value.length > 22 ? value.slice(0, 10) + '…' + value.slice(-8) : value
    }

    function formatReset(seconds) {
      if (!Number.isFinite(seconds)) return '重置时间未知'
      const date = new Date(seconds * 1000)
      const remaining = date.getTime() - Date.now()
      if (remaining <= 0) return '即将重置'
      const hours = Math.floor(remaining / 3600000)
      const minutes = Math.max(1, Math.floor((remaining % 3600000) / 60000))
      const relative = hours >= 24 ? Math.floor(hours / 24) + ' 天后' : hours > 0 ? hours + ' 小时 ' + minutes + ' 分后' : minutes + ' 分后'
      return relative + ' · ' + date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    function UsageCard(props) {
      const used = Math.max(0, Math.min(100, Number(props.window.usedPercent) || 0))
      return h('div', { className: 'codexUsage' },
        h('div', { className: 'codexUsageHead' },
          h('span', { className: 'codexUsageName' }, props.name),
          h('span', { className: 'codexUsageValue' }, '已用 ' + Math.round(used) + '% · 剩余 ' + Math.max(0, Math.round(100 - used)) + '%'),
        ),
        h('div', { className: 'codexBar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': used },
          h('div', { className: 'codexBarFill' + (used >= 80 ? ' high' : ''), style: { width: used + '%' } }),
        ),
        h('div', { className: 'codexReset' }, formatReset(props.window.resetAt)),
      )
    }

    function CodexSection() {
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [watchLogin, setWatchLogin] = useState(false)

      const wake = useCallback(async () => {
        const response = await fetch(WAKE, { method: 'POST', cache: 'no-store' })
        if (!response.ok) throw new Error('HTTP ' + response.status)
      }, [])

      const load = useCallback(async (refresh) => {
        try {
          await wake()
          const response = await fetch(BASE + '/status' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setStatus(value)
          setError('')
          if (value.loggedIn) setWatchLogin(false)
        } catch (loadError) {
          setError('无法启动本机 Codex 插件服务。请重试。' + (messageOf(loadError) ? ' (' + messageOf(loadError) + ')' : ''))
        }
      }, [wake])

      useEffect(() => {
        if (!watchLogin) return undefined
        const timer = window.setInterval(() => { void load(false) }, 2000)
        return () => { window.clearInterval(timer) }
      }, [load, watchLogin])

      const login = async () => {
        const popup = window.open('about:blank', 'dsh-openai-codex-login', 'popup,width=560,height=760')
        if (popup === null) {
          setError('浏览器阻止了登录窗口，请允许此站点打开弹窗。')
          return
        }
        try {
          await wake()
          popup.location.href = BASE + '/start'
          setWatchLogin(true)
        } catch (loginError) {
          popup.close()
          setError(messageOf(loginError))
        }
      }

      const logout = async () => {
        if (!status || !status.csrf) return
        setBusy(true)
        try {
          await wake()
          const response = await fetch(BASE + '/logout', { method: 'POST', headers: { 'x-dsh-csrf': status.csrf } })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          await load(false)
        } catch (logoutError) { setError(messageOf(logoutError)) }
        finally { setBusy(false) }
      }

      const refresh = async () => {
        setBusy(true)
        await load(true)
        setBusy(false)
      }

      const refreshModels = async () => {
        if (!status || !status.csrf) return
        setBusy(true)
        try {
          await wake()
          const response = await fetch(BASE + '/models', { method: 'POST', headers: { 'x-dsh-csrf': status.csrf } })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          await load(false)
        } catch (modelError) { setError(messageOf(modelError)) }
        finally { setBusy(false) }
      }

      const usage = status && status.usage
      const loading = busy
      const connected = Boolean(status && status.loggedIn)
      const pending = Boolean(status && status.loginPending) || watchLogin
      const plan = usage && usage.planType ? String(usage.planType).toUpperCase() : 'ChatGPT 订阅'
      const windows = useMemo(() => {
        if (!usage) return []
        const rows = []
        if (usage.primary) rows.push({ name: usage.primary.windowSeconds === 18000 ? '5 小时额度' : '短周期额度', window: usage.primary })
        if (usage.secondary) rows.push({ name: '周额度', window: usage.secondary })
        return rows
      }, [usage])

      return h('section', { className: 'codexSection' },
        h('h2', { className: 'codexTitle' }, 'OpenAI Codex'),
        h('p', { className: 'codexIntro' }, '使用 ChatGPT Plus、Pro、Team 或 Enterprise 订阅登录，并在这里查看 Codex 额度。登录结果自动用于“模型提供方”中的 openai-codex。'),
        h('div', { className: 'codexCard' },
          h('div', { className: 'codexHero' },
            h('div', { className: 'codexBrand' },
              h('div', { className: 'codexLogo', 'aria-hidden': true }, 'OA'),
              h('div', null,
                h('h3', { className: 'codexName' }, 'OpenAI Codex 订阅'),
                h('p', { className: 'codexMeta', title: connected ? status.accountId : '' }, loading ? '正在读取 OpenAI 登录状态' : connected ? shortAccount(status.accountId) : '尚未连接 ChatGPT 账号'),
              ),
            ),
            h('span', { className: 'codexBadge ' + (connected ? 'connected' : loading || pending ? 'pending' : '') },
              h('span', { className: 'codexDot', 'aria-hidden': true }), loading ? '刷新中…' : connected ? '已连接' : pending ? '等待登录' : '未登录',
            ),
          ),
          h('div', { className: 'codexBody' },
            busy && status === null
              ? h('div', { 'aria-label': '加载中' }, h('div', { className: 'codexSkeleton' }), h('div', { className: 'codexSkeleton', style: { width: '72%' } }))
              : connected
                ? h(React.Fragment, null,
                    h('div', { className: 'codexPlan' }, h('strong', null, plan), h('span', null, usage && usage.fetchedAt ? '更新于 ' + new Date(usage.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '额度信息待更新')),
                    windows.length > 0
                      ? h('div', { className: 'codexGrid' }, windows.map((row) => h(UsageCard, { key: row.name, name: row.name, window: row.window })))
                      : h('p', { className: 'codexEmpty' }, '账号已连接，暂时没有返回可展示的额度窗口。'),
                    usage && Number.isFinite(usage.resetCredits) ? h('p', { className: 'codexNotice' }, '可用额度重置次数：' + usage.resetCredits) : null,
                    status.models && status.models.models
                      ? h('p', { className: 'codexNotice' }, '当前账号可用模型（Codex ' + status.models.clientVersion + '）：' + status.models.models.map((model) => model.name || model.id).join('、'))
                      : null,
                    status.usageError ? h('p', { className: 'codexError', role: 'status' }, '额度读取失败：' + status.usageError) : null,
                    status.modelError ? h('p', { className: 'codexError', role: 'status' }, '模型同步失败：' + status.modelError) : null,
                  )
                : h('p', { className: 'codexEmpty' }, '点击登录会打开 OpenAI 官方授权页。插件仅在 Host 侧保存和刷新令牌，Web 页面不会读取令牌。'),
            status && status.loginError ? h('p', { className: 'codexError', role: 'alert' }, '登录失败：' + status.loginError) : null,
            error ? h('p', { className: 'codexError', role: 'alert' }, error) : null,
            h('div', { className: 'codexActions' },
              h('button', { type: 'button', className: 'codexButton primary', disabled: busy || pending, onClick: () => { void login() } }, connected ? '重新登录' : pending ? '等待授权…' : '登录 OpenAI'),
              status === null ? h('button', { type: 'button', className: 'codexButton', disabled: busy, onClick: refresh }, busy ? '读取中…' : '读取登录状态') : null,
              connected ? h('button', { type: 'button', className: 'codexButton', disabled: busy, onClick: refresh }, busy ? '刷新中…' : '刷新用量') : null,
              connected ? h('button', { type: 'button', className: 'codexButton', disabled: busy, onClick: () => { void refreshModels() } }, busy ? '同步中…' : '同步模型') : null,
              connected ? h('button', { type: 'button', className: 'codexButton danger', disabled: busy, onClick: () => { void logout() } }, '退出登录') : null,
            ),
          ),
        ),
        h('p', { className: 'codexNotice' }, '此页面通过 127.0.0.1 本机桥接服务工作；远程打开 DSH Web 时不会暴露认证接口。'),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'openai-codex',
        order: 11,
        label: () => 'OpenAI Codex',
      }, CodexSection))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
