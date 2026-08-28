# QA Report — dsh-plugin-hanzeep (Sprint 5)

**Date:** 2026-08-28 (session crossed midnight from 2026-08-27)
**Mode:** Full (adapted for a no-UI dsh plugin: suite + coverage + real-host smoke in place of browser QA)
**Repo/branch:** sharework-ai/dsh-plugin-hanzeep @ master
**Test plan input:** docs/testing/test-plan.md
**LLM availability:** none (DEEPSEEK_API_KEY absent) — all verification is deterministic; the LLM loop remains covered by 110→114 scripted-LlmPort unit tests

## Summary

| | Count |
|---|---|
| Issues found | 3 (+1 test-coverage gap, +1 documented limitation) |
| Fixes applied (verified) | 3 |
| Fixes reverted | 0 |
| Deferred | 1 (concurrent same-name doc_generate; see TODOS.md) |
| Health score | baseline 72 → final 98 |

**PR summary:** QA found 3 issues (2 critical distribution-shape, 1 medium), fixed all 3 with regression tests; npm-tarball → real dsh host e2e now 10/10 green; suite 114/114; coverage gate unchanged (100/87.69/100/100).

All three issues were invisible to the 110 passing unit tests: they live in the **bundle/package distribution layer**, which unit tests never cross (they mount the plugin programmatically). The host-mount smoke through the official `dsh plugin add` path is what exposed them.

## Verification evidence

| Check | Result |
|---|---|
| `pnpm test:coverage` (baseline, pre-fix) | 110/110, gate green |
| `pnpm vitest run` (final) | 114/114 (10 files) |
| Coverage gate (final) | 100% stmts/lines/funcs, 87.69% branches (gate 80) |
| Host smoke — link: install (`dsh plugin add <repo>`) | 10/10 PASS |
| Host smoke — **npm tarball install** (fresh profile, `dsh plugin add <tgz>`) | 10/10 PASS (post-fix; pre-fix it fails at boot) |
| `dsh --profile smoke --dump-config` | hanzeep row composed with patch config |
| Tarball contents | cordis.patch.yml + packs/ + lib/ + package.json present |

Host smoke checks: real profile boot → ToolRuntime mounted → both tools registered → doc_validate on golden sample returns green receipt → anchored sidecar + tampered artifact returns hashMatches=false → unknown pack fails loud listing available packs.

## Issues

### ISSUE-001 — bundle patch row `name` was not the importable package name (critical)
- **Symptom:** booting the profile failed: `failed to import loader entry hanzeep (hanzeep): Cannot find package 'hanzeep'`
- **Root cause:** `cordis.patch.yml` insert row had `name: hanzeep`; a cordis entry's `name` is the loader's import specifier (dsh house style: `name: '@deepseek-ai/dsh-tools'`), not a display label.
- **Fix:** `name: dsh-plugin-hanzeep` — commit be8be77
- **Regression test:** tests/bundle-patch.spec.ts (every insert row's name === package.json name) — commit fe85c35
- **Status:** verified (host smoke boots and registers both tools)

### ISSUE-002 — npm tarball did not ship `cordis.patch.yml` (critical for registry users)
- **Symptom:** `files: ["lib", "packs"]` omitted the patch file; a registry install declares `dsh.bundle.patch` but the file is absent, and `loadOverlayPatches` fails loud on every boot: `failed to read overlay ... ENOENT`.
- **Why the smoke missed it first:** link: installs expose the whole repo; only a tarball install reproduces.
- **Fix:** `files` includes `cordis.patch.yml` — commit ffcfab5
- **Regression test:** tests/bundle-patch.spec.ts (files ships the declared patch) — commit 41fb31c
- **Status:** verified (npm pack contents + tarball-profile smoke 10/10)

### ISSUE-003 — `types`/`exports.*.types` pointed at nonexistent `lib/types/` (medium)
- **Root cause:** tsc emits declarations beside the JS at lib/ root (outDir lib, rootDir src); package.json declared `lib/types/index.d.ts`.
- **Impact:** runtime unaffected (loader uses `default`); TS consumers of the plugin resolved dangling type paths.
- **Fix:** `types: lib/index.d.ts`, exports `./lib/index.d.ts`, `./lib/pack.d.ts` — commit 70a1241
- **Regression test:** tests/bundle-patch.spec.ts (declared types match flat layout) — commit 05dd54c
- **Status:** verified (tarball paths exist)

### Test-coverage gap — CJK/space material paths (filled)
- Test plan called for 中文与空格文件路径; no test existed. Added `reads CJK and space filenames` — commit 885d740. 9/9 in that file.

### Documented limitation — concurrent same-name doc_generate (deferred)
- writeAtomic gives per-file atomicity, but two concurrent generations with the same artifactName can interleave artifact/receipt pairs (last-writer-wins per file, no lock). Recorded in TODOS.md rather than papered over with a racy assertion.

## Test-plan cross-check

| Plan item | Where covered |
|---|---|
| 生成→校验→打回→修复→全绿 | tests/loop.spec.ts, materials-doc-tools.spec.ts (scripted LlmPort) |
| 迭代耗尽草稿+红回执 | materials-doc-tools.spec.ts:70 |
| 振荡检测 | loop.spec.ts |
| doc_validate 绿/红回执 | review-fixes.spec.ts + host smoke checks 1/2 |
| consumes 链上游校验 | review-fixes.spec.ts |
| 路径越界/symlink 逃逸 | materials-doc-tools.spec.ts, review-fixes.spec.ts |
| LLM 抛异常/token 预算 | loop.spec.ts, materials-doc-tools.spec.ts:99 |
| 中文与空格路径 | materials-doc-tools.spec.ts (added this run) |
| 并发同名 | deferred (TODOS.md) |
| session append 中途失败 | implementation evolved: draft-first persistence at loop end; mid-loop crash retention is the deferred 草稿续修 item — plan text was aspirational, not shipped behavior |
| golden 全绿 + 变异测试 | rules.spec.ts + host smoke |
| 修复收敛率基线 | spike:convergence script exists; needs DEEPSEEK_API_KEY (deferred with LLM work) |

## Real-LLM note

`doc_generate` closed-loop against the live provider was NOT exercised (no API key). Unit coverage of the loop is thorough (scripted LlmPort, oscillation, exhaustion, abort); the remaining risk is prompt/model quality, which is exactly what the convergence spike will baseline when a key is available.

## Environment facts confirmed this run

- dsh-tools on the local checkout reports 0.1.1-rc.2 (newer than the incomplete rc.1 line noted in README) — re-evaluating registry-vs-file: devDeps is a Sprint 6 /ship question, not a defect.
- Peer resolution for registry-installed plugins goes through dsh's healed `$DSH_HOME/profiles/node_modules` fallback — verified working from the tarball profile; the earlier "peers won't resolve" concern is closed.
- `dsh plugin --profile <p> add <tgz|path>` + `--dump-config` + programmatic `runProfile` boot are the reproducible smoke path (script kept at /tmp/hanzeep-qa/smoke-host.mts; worth committing a cleaned version as a pre-publish check — see TODOS).

## Baseline

Final baseline recorded in baseline.json (healthScore 98, 3 issues all fixed).
