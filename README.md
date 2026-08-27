# hanzeep

Closed-loop AI document generation for [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness): **domain rule packs + replayable validation receipts + a repair loop that refuses to ship red documents**.

JSON is the single source of truth. Every generated document is validated against its pack's JSON Schema and rule set; failures are fed back to the model for repair until all rules pass (or the loop exhausts and keeps a red-marked draft). Every document ships with a machine-readable receipt anyone can re-verify.

## Quickstart (deterministic, ~2 minutes, no API key)

```sh
dsh plugin add dsh-plugin-hanzeep   # 1. install the bundle into your profile
dsh                                 # 2. start a session with the profile
```

Then, in the session:

```
> doc_validate(artifactPath: "<pack dir>/samples/golden.json", pack: "cosmic-plan", language: "zh-CN")
```

You get an all-green receipt in seconds — zero LLM calls. This is the deterministic first-run moment; `doc_generate` (the closed loop) is step two.

## Tools

### `doc_generate`

| Parameter | Type | Notes |
|---|---|---|
| `pack` | string | e.g. `cosmic-plan`; unknown names list available packs |
| `materials` | string[] | workspace-relative file paths, or inline text starting with `#!inline` |
| `language` | string? | default: config `defaultLanguage`, else the pack's first language |
| `upstream` | string[]? | upstream artifact JSON for chained packs (must be green) |
| `artifactName` | string? | output base name (default `<pack>-<timestamp>`) |

Returns `{ artifactPath, markdownPath, receipt }`. Exhausted loops throw AND keep the draft + red receipt on disk.

### `doc_validate`

Re-runs the ruleset over an existing artifact — deterministic, no LLM. Returns a fresh receipt; a hash mismatch means the artifact changed after generation.

## Configuration (cordis.yml)

```yaml
- id: hanzeep
  config:
    packsDir: ""            # extra pack dirs; same-name packs override built-ins
    workspaceRoot: ""       # path containment root for materials/artifacts (default: cwd)
    defaultLanguage: "zh-CN"
    maxIterations: 5        # repair-loop round cap
    promptTokenBudget: 60000
    provider: "deepseek"    # LLM route for doc_generate (required)
    model: "deepseek-chat"
```

## Packs

Hybrid packs: declarative JSON rules for simple families, JS functions for cross-field rules.

```
packs/cosmic-plan/
├── manifest.json     # name, version, consumes, languages
├── schema.json       # draft-07 JSON Schema
├── rules/zh-CN.json  # declarative: minLength / maxLength / forbiddenKeywords / pattern
├── rules/functions.js# export const rules = [{ id, severity, suggestion, check(artifact) }]
├── prompts/zh-CN.md  # generator prompt with {{materials}} / {{upstream}} slots
├── templates/zh-CN.hbs
└── samples/golden.json  # must pass all-green; feeds mutation tests
```

**Pack contract:** every ERROR rule carries a `suggestion`; every language in `manifest.languages` provides rules + prompt + template; golden sample + per-rule-family mutations are mandatory (a checker that cannot catch a deliberately broken sample is decoration).

## Development

```sh
pnpm install
pnpm test            # 80 tests, coverage gate 100% lines/functions/statements
pnpm run build       # tsc + tsdown
```

**Note on devDependencies:** `@deepseek-ai/dsh-*` packages link to a local `deepseek-harness` checkout via `file:` because the published npm `0.0.1-rc.1` line is incomplete (e.g. `dsh-llm` depends on the unpublished `dsh-type-meta`). Runtime consumers never install these — they are `peerDependencies` resolved from the host dsh installation. Switch the `file:` entries back to registry versions once dsh publishes a complete release.

## Limitations

- Receipts are tamper-evident, not tamper-proof (no signature): accidental edits go red; a determined attacker can forge both artifact and receipt.
- Repair-loop observability lives in the receipt (per-round issue counts); dedicated session events are future work.
- Materials are trusted input: malicious material content can steer generation (documented trust model).
