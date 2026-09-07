# Codex model-catalog gating: why `gpt-5.6-sol` is absent

## Conclusion

For the tested OAuth token/account, the omission is **client-version filtering**, not an authentication failure and not caused by `originator: deepseek-harness`. With every other request input held constant, `client_version=0.143.0` omitted `gpt-5.6-sol`, while `0.144.0` included it. This exactly matches OpenAI Codex's current first-party metadata, which marks Sol as visible but sets `minimal_client_version` to `0.144.0`.[^sol-metadata]

The catalog is discovery/metadata, not an authorization boundary. The official client preserves an explicitly supplied model name and synthesizes fallback metadata when that name is missing from its catalog.[^explicit-model][^fallback] The backend still decides whether a request is accepted. In this account's live test, a direct `/backend-api/codex/responses` request for `gpt-5.6-sol` returned HTTP 200 even though the same account's `client_version=0.130.0` catalog omitted it.

## Proven facts

### First-party source

- Codex deliberately constructs `GET .../models?client_version=<version>`; the query is part of the official request path, not incidental client telemetry.[^models-request]
- The current bundled model record says `gpt-5.6-sol` has `visibility: "list"`, `minimal_client_version: "0.144.0"`, and `supported_in_api: true`.[^sol-metadata] Sol is absent from the source catalog shipped at the Codex 0.130.0 commit, while models returned by the observed endpoint have lower declared minima there.[^v0130-models]
- The official HTTP client always installs `originator` and `User-Agent`. Its default originator is `codex_cli_rs`; its recognized first-party values include `codex_cli_rs`, `codex-tui`, `codex_vscode`, and `Codex ...`. `deepseek-harness` is not in that recognition function.[^originator]
- ChatGPT authentication attaches `ChatGPT-Account-ID`, so the server can make account-scoped decisions.[^account-header] Open-source client code does **not** expose the closed-source server's rollout algorithm.
- For an explicit model, Codex returns the caller's string unchanged rather than requiring picker membership.[^explicit-model] If no remote catalog entry matches, it creates fallback metadata with `supported_in_api: true`.[^fallback]

### Controlled first-party endpoint behavior

All probes used the same bearer token and `ChatGPT-Account-ID`; no credential was logged.

| Changed input | Observed catalog membership |
|---|---|
| Exact reported request: version `0.130.0`, originator `deepseek-harness`, UA `dsh-openai-codex-auth/0.2` | HTTP 200; `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`, `codex-auto-review`; no Sol |
| Only version changed through `0.143.0` | Same four slugs; no Sol |
| Only version changed to `0.144.0` | HTTP 200; eight slugs including Sol |
| At `0.130.0`, originator changed to `codex_cli_rs` or omitted; UA separately changed to a Codex-like value | No membership change |
| At `0.144.0`, originator varied among `deepseek-harness`, official values, and another third-party value | Same eight-slug membership, including Sol |
| Direct Responses request for Sol with the original account/originator/UA | HTTP 200 and a streamed response body |

This A/B isolates the local omission to the version boundary. It does **not** prove that originator or account never affect other accounts, metadata fields, or future responses.

## Gate assessment

### Client version — proven cause here

`0.130.0 < 0.144.0`, the declared minimum. The controlled boundary test reproduced that exact cutoff. OpenAI issue #32482 independently reports the same-account split between a 0.142 app server that omitted Sol/asked for a newer version and a 0.144.1 client that worked.[^issue-version] Issue #33146 reports a similarly short catalog from a 0.142.3 cache and Sol variants in 0.144.4.[^issue-short-catalog]

**Operational implication:** send the real installed Codex client version, and update it. Supplying an arbitrarily high version can reveal later/experimental catalog entries and is not evidence that this integration actually implements their required protocol or UI behavior.

### Originator — not the omission cause in this A/B

Changing only originator did not change slug membership below or above the version boundary. Therefore changing `deepseek-harness` to `codex_cli_rs` does not fix this observed omission. Originator is still meaningful: official source classifies first-party originators,[^originator] and issue #33593 reports different ETags/Sol metadata when only originator changed.[^issue-originator] That supports possible originator-based **metadata/context-window** treatment, but it is not proof of Sol membership suppression for this request.

### Account/rollout — possible generally, unproven here

The account ID is sent, so account-scoped gating is technically possible.[^account-header] Current Sol metadata also declares plan availability (including Plus, Pro, Team, Enterprise, and others),[^sol-plans] but that static list cannot prove enrollment of this particular account. No primary source found states that this account was excluded from a rollout. Account rollout is therefore a hypothesis, and it is unnecessary to explain the measured 0.130.0 result because version alone reproduces it.

## Can an absent model still work?

**Yes, sometimes.** Catalog/picker visibility and invocation are separate:

1. Official Codex permits an explicit model string absent from its catalog and falls back to generic metadata.[^explicit-model][^fallback]
2. This account's direct Sol invocation returned HTTP 200 while its 0.130.0 catalog omitted Sol.
3. Issue #43342 records another first-party behavior example where a model missing from `/model` worked with explicit `-m`.[^issue-callable]

But absence is not a promise of access. Issue #35898 records an explicit Sol request rejected by the backend with `Model not found`.[^issue-rejected] The authoritative test is a minimal authorized request to the actual inference endpoint; HTTP status and response model should be checked without exposing tokens.

## Evidence quality

OpenAI source and the authenticated endpoint A/Bs above are the strongest evidence. GitHub issues are cited only as firsthand reproductions, not maintainer guarantees. The backend implementation is closed, so claims about its general rollout logic remain hypotheses.

[^models-request]: OpenAI Codex source, [`models.rs` lines 31–78](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/codex-api/src/endpoint/models.rs#L31-L78).
[^sol-metadata]: OpenAI Codex source, [`models.json` lines 173–240](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/models-manager/models.json#L173-L240).
[^v0130-models]: OpenAI Codex 0.130.0-era source, [`models.json` lines 24–49 and 193–218](https://github.com/openai/codex/blob/58573da43ab697e8b79f152c53df4b42230395a8/codex-rs/models-manager/models.json#L24-L49).
[^originator]: OpenAI Codex source, [default originator and override, lines 40–80](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/login/src/auth/default_client.rs#L40-L80), [first-party classification, lines 153–162](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/login/src/auth/default_client.rs#L153-L162), and [default headers, lines 335–350](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/login/src/auth/default_client.rs#L335-L350).
[^account-header]: OpenAI Codex source, [`auth.rs` lines 87–107](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/model-provider/src/auth.rs#L87-L107).
[^explicit-model]: OpenAI Codex source, [`manager.rs` lines 153–183](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/models-manager/src/manager.rs#L153-L183).
[^fallback]: OpenAI Codex source, [catalog lookup fallback, lines 654–672](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/models-manager/src/manager.rs#L654-L672), and [fallback descriptor, lines 142–160](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/models-manager/src/model_info.rs#L142-L160).
[^sol-plans]: OpenAI Codex source, [Sol `available_in_plans`, lines 259–281](https://github.com/openai/codex/blob/121f91fd5d9dc66017866ce9bdc49f1e182721df/codex-rs/models-manager/models.json#L259-L281).
[^issue-version]: OpenAI Codex issue [#32482](https://github.com/openai/codex/issues/32482).
[^issue-short-catalog]: OpenAI Codex issue [#33146](https://github.com/openai/codex/issues/33146).
[^issue-originator]: OpenAI Codex issue [#33593](https://github.com/openai/codex/issues/33593).
[^issue-callable]: OpenAI Codex issue [#43342](https://github.com/openai/codex/issues/43342).
[^issue-rejected]: OpenAI Codex issue [#35898](https://github.com/openai/codex/issues/35898).
