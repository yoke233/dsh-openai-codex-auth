<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-openai-codex-auth：在 DeepSeek Harness 中完成 OpenAI Codex 订阅登录、用量查看与本地凭据接入">
</p>

<p align="center">
  <strong>把 ChatGPT 订阅登录接入 DeepSeek Harness。</strong><br>
  在 DSH 设置页完成 OpenAI OAuth 登录、查看 Codex 用量，并自动向 <code>openai-codex</code> 模型提供方提供有效凭据。
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能一览">功能一览</a> ·
  <a href="#工作方式">工作方式</a> ·
  <a href="#配置">配置</a> ·
  <a href="#凭据处理边界">凭据处理边界</a>
</p>

## 快速开始

将插件安装到 DSH 的 `web` profile：

```sh
dsh plugin --profile web add github:yoke233/dsh-openai-codex-auth
```

启动或重启该 profile：

```sh
dsh --profile web
```

然后完成首次连接：

1. 打开 DSH Web，进入 **设置 → OpenAI Codex**。
2. 点击 **登录 OpenAI**，在弹出的 OpenAI 官方授权页完成登录。
3. 返回 DSH，在 **设置 → 模型提供方** 中选择 `openai-codex`。

> [!IMPORTANT]
> 登录管理接口只监听 `127.0.0.1`。请在运行 DSH Web profile 的同一台电脑上打开设置页并完成授权。

## 功能一览

| 能力 | 说明 |
| --- | --- |
| OpenAI 订阅登录 | 通过 OAuth 连接 ChatGPT Plus、Pro、Team 或 Enterprise 账号 |
| Codex 用量面板 | 展示短周期与周用量、剩余额度和重置时间 |
| 自动凭据续期 | 在令牌接近过期时刷新，并更新本地凭据 |
| DSH 模型接入 | 将有效令牌提供给 `openai-codex` 模型提供方 |
| 设置页管理 | 支持查看状态、刷新用量、重新登录和退出登录 |

## 工作方式

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="OpenAI OAuth 授权经本机回调写入受保护凭据，再供 openai-codex 提供方和 DSH 用量面板使用">
</p>

1. 插件生成 PKCE verifier、challenge 和随机 `state`，再打开 OpenAI 授权页。
2. OpenAI 将授权结果返回到本机 `localhost:1455`；插件校验 `state` 并交换令牌。
3. 凭据原子写入本地文件，访问令牌通过 DSH credentials 注入 `DSH_OPENAI_CODEX_TOKEN`。
4. 设置页通过本机 `127.0.0.1:1456` 控制服务读取登录状态和 Codex 用量，不接触令牌内容。

## 配置

插件通常无需额外配置。默认凭据文件为：

```text
$DSH_HOME/openai-codex-auth.json
```

如需改变存储位置，可在 Cordis 配置中设置 `path`：

```yaml
- insert:
    - id: openai-codex-auth
      name: dsh-openai-codex-auth
      config:
        path: /secure/path/openai-codex-auth.json
```

`path` 的优先级高于 `dshHome`。

## 凭据处理边界

以下内容仅说明插件如何处理本地凭据与管理接口，不代表或承诺任何 OpenAI 账号风控结果。

- OAuth 授权使用 PKCE，并通过随机 `state` 防止回调串用。
- 凭据目录与文件分别以 owner-only 权限创建，并通过原子写入更新。
- access token 与 refresh token 只保存在 Host 侧；Web 页面不会读取或保存它们。
- 控制服务只监听 `127.0.0.1`，仅接受本地 DSH Web origin。
- 登出等状态变更请求必须携带 CSRF token。

## 常见问题

<details>
<summary><strong>设置页提示“无法连接本机 Codex 插件服务”</strong></summary>

确认 `web` profile 已启动，并在运行该 profile 的同一台电脑上打开 DSH Web。安装或更新插件后请重启 profile。

</details>

<details>
<summary><strong>点击登录后没有出现授权页面</strong></summary>

浏览器可能拦截了弹窗。允许 DSH Web 打开弹窗后，再次点击 **登录 OpenAI**。

</details>

<details>
<summary><strong>账号已连接，但没有显示额度窗口</strong></summary>

点击 **刷新用量** 重试。若 OpenAI 当前未返回可展示的用量窗口，插件会保留登录状态并在设置页说明情况。

</details>

<details>
<summary><strong>如何通过 HTTP 代理连接 OpenAI？</strong></summary>

启动 DSH 前设置 `HTTP_PROXY`、`HTTPS_PROXY` 和可选的 `NO_PROXY`。插件会自动读取这些环境变量，无需设置 `NODE_USE_ENV_PROXY`。

```sh
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 dsh --profile web
```

</details>

## 本地开发

```sh
pnpm install
pnpm run build
pnpm test
dsh plugin --profile web add ./openai-codex-auth
```

## License

[MIT](./LICENSE)
