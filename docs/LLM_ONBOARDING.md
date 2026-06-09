# LLM Onboarding — vscode-levelups

This document is the single source of truth for an LLM continuing work on this
project. Read it fully before changing code.

## 1. What this project is

`vscode-levelups` is a VS Code extension that adds navigation, language
intelligence, and Liquibase tooling for Java Spring Boot projects. It is
deliberately a **background extension**:

- No custom views, sidebars, webviews, or status bar items.
- The only UI surfaces are: standard "Go to Definition", one command
  (`vscodeLevelups.executeSql`), one optional CodeLens, QuickPick/warning
  dialogs, and an `OutputChannel` named "VSCode Levelups".
- Everything is controlled via `settings.json`. Every feature is on by default
  and can be toggled independently at runtime (no reload).

The guiding principle: behave as if VS Code natively supported these features.

## 2. Features (current state)

1. **`@PreAuthorize` SpEL navigation** — Ctrl/Cmd-click beans (`@bean`), method
   calls (`@bean.method()`), and types (`T(pkg.Class)`) inside Spring Security
   SpEL expressions to jump to their definitions.
2. **`@PreAuthorize` / `@Value` syntax highlighting** — TextMate grammar
   injection colors SpEL tokens and `${...}` placeholders inside the
   annotations (so they are not plain string text).
3. **`@Value` property navigation** — Ctrl/Cmd-click a `${property.key}` to jump
   to its declaration in `application*.properties|yml|yaml` /
   `bootstrap*.properties|yml|yaml`.
4. **Liquibase `<sql>` highlighting** — TextMate grammar injection highlights
   embedded SQL inside `<sql>` blocks in changelog XML.
5. **Liquibase SQL execution** — command + CodeLens extract the nearest `<sql>`
   block, prompt for a connection profile, and run it through a pluggable
   `SqlDriver` (a mock driver ships by default; no real DB drivers are bundled).
6. **Liquibase file-reference navigation** — Ctrl/Cmd-click the path in
   `<include file>`, `<includeAll path>`, `<sqlFile path>` to open the
   referenced file/directory.

## 3. Tech stack & key decisions

- **Language:** TypeScript, `strict` mode.
- **Bundler:** esbuild (`esbuild.js`) → `dist/extension.js`. `vscode` is marked
  external.
- **Parsing:** pure-JS only — **no native bindings**. Java/properties/XML are
  parsed with lightweight regex/line scanning. `yaml` is the only runtime
  dependency (used for property YAML flattening). Earlier plans mentioned
  `java-parser`/`node-sql-parser`/`fast-xml-parser`; these were removed because
  nothing imported them. Do not reintroduce native parsers casually — they break
  CI/packaging across VS Code Electron ABIs.
- **Tests:** Mocha unit tests (no vscode at runtime) + `@vscode/test-electron`
  integration tests.
- **SQL execution depth:** pluggable `SqlDriver` interface with a `MockSqlDriver`
  default. Real DB drivers are an intentional extension point, not bundled.

## 4. Repository layout

```
src/
  extension.ts                       activation, indexing, feature registration, lifecycle
  settings/settings.ts               typed config accessors + SqlConnection type
  shared/
    logger.ts                        OutputChannel "VSCode Levelups"
    fileWatcher.ts                   createWatcher() FileSystemWatcher helper
  java/
    javaWorkspaceScanner.ts          findJavaFiles(), readFile() (vscode fs)
    javaClassResolver.ts             detectBeansInSource, findTypeInSource, defaultBeanName
    javaMethodResolver.ts            findMethodLocation
  spring-security/
    spelParser.ts                    parseSpel, tokenAtOffset, SpelTokenKind
    beanIndex.ts                     BeanIndex (name -> BeanInfo), @Bean factory methods
    preAuthorizeDefinitionProvider.ts  resolveSpelTarget (pure) + provider
  spring-properties/
    yamlResolver.ts                  flattenYaml (multi-document aware)
    propertyIndex.ts                 PropertyIndex (key -> locations)
    valueDefinitionProvider.ts       extractPropertyKeyAt (pure) + provider
  liquibase/
    liquibaseDetector.ts             isLiquibaseChangelog
    sqlInjection.ts                  findEnclosingSqlBlock (pure)
    sqlExecution.ts                  SqlDriver, MockSqlDriver, pickConnection, executeSqlCommand
    liquibaseCodeLens.ts             "Execute SQL Block" CodeLens
    fileReferenceResolver.ts         findFileReferenceAtOffset, resolveReferencePaths (pure)
    liquibaseFileDefinitionProvider.ts  file-reference DefinitionProvider
  test/
    unit/*.test.ts                   Mocha unit tests (one per module)
    integration/extension.test.ts    @vscode/test-electron tests
    suite/index.ts                   Mocha loader for integration suite
    runIntegration.ts                downloads/launches VS Code test host
    fixtures/                        sample Spring/Liquibase files (NOT compiled; referenced from src path)
syntaxes/
  liquibase-sql.tmLanguage.json      SQL injection into text.xml <sql> blocks
  spring-java.tmLanguage.json        SpEL/@Value injection into source.java
media/levelups.png                   marketplace icon (256x256)
docs/                                specs, plans, this onboarding doc
```

## 5. Critical conventions (follow these exactly)

### 5.1 The vscode lazy-require pattern
Unit tests run under plain Node where the `vscode` module does **not** exist.
Any module that a unit test imports MUST NOT trigger a top-level
`require("vscode")`. Rules:

- **Pure-logic modules** (parsers, indexes, resolvers): never import `vscode`.
- **Provider/command modules** that need vscode at runtime: use
  `import type * as vscode from "vscode";` (type-only, erased at compile) and
  lazily require inside the method:
  ```ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vs: typeof import("vscode") = require("vscode");
  ```
- `src/extension.ts` is the runtime entry, is never imported by tests, and may
  use a normal `import * as vscode from "vscode"`.
- `src/shared/logger.ts` imports vscode at top level, so other modules require it
  lazily too (see `sqlExecution.ts`).

If you add a provider and a unit test starts failing with
`Cannot find module 'vscode'`, you broke this rule.

### 5.2 Pure logic + thin provider
Each feature splits into a **pure, unit-tested function** (offset/string in →
result out) and a **thin vscode provider** that wires the pure function to the
editor. Examples: `resolveSpelTarget`, `extractPropertyKeyAt`,
`findEnclosingSqlBlock`, `findFileReferenceAtOffset` + `resolveReferencePaths`.
Add new logic this way so it is testable without vscode.

### 5.3 TDD
Write the failing unit test first, run it to see it fail for the right reason,
then implement. Never weaken a test to make it pass. See any `src/test/unit/*`
file for the style.

### 5.4 DefinitionProvider underline range
When a `DefinitionProvider` returns a plain `Location`, VS Code underlines the
"word" under the cursor using the language's word pattern — which splits paths
like `db.lpt-main-26.02.00.19.xml` into fragments. To underline a custom range
(e.g. a whole path), return a `LocationLink[]` with an explicit
`originSelectionRange`. `liquibaseFileDefinitionProvider.ts` does this.

### 5.5 Feature registration & disposal
`registerFeatures()` in `extension.ts` runs on activation and on every
`vscodeLevelups` config change. It disposes the previous generation of
`featureDisposables` and rebuilds based on current settings. **Do not** push
`featureDisposables` onto `context.subscriptions` (that leaks a disposed
generation on each config change). `deactivate()` disposes the final set. Add new
toggleable providers inside `registerFeatures` guarded by their setting.

### 5.6 TextMate grammars
Highlighting is delivered via grammar injection contributed in `package.json`
(`contributes.grammars`, `injectTo`). Grammars cannot be unit-tested without a
tokenizer; verify them by JSON validity
(`node -e "require('./syntaxes/<file>.json')"`) plus manual check in the
Extension Development Host (F5). Highlighting is always-on (a static grammar
cannot be toggled at runtime) and intentionally has no setting.

## 6. Settings

Defined in `package.json` `contributes.configuration` and read via
`src/settings/settings.ts` (`Settings` class, live-reading getters):

| Setting | Default | Controls |
|---|---|---|
| `vscodeLevelups.enablePreAuthorizeNavigation` | `true` | `@PreAuthorize` DefinitionProvider |
| `vscodeLevelups.enableValueNavigation` | `true` | `@Value` DefinitionProvider |
| `vscodeLevelups.enableLiquibaseSqlExecution` | `true` | SQL execution CodeLens + command behavior |
| `vscodeLevelups.enableLiquibaseFileNavigation` | `true` | Liquibase file-reference DefinitionProvider |
| `vscodeLevelups.sql.connections` | `[]` | SQL connection profiles (`{name, jdbcUrl, username, password}`) |

To add a setting: update `package.json`, add a `SECTION_KEYS` entry + getter in
`settings.ts`, assert its default in `src/test/unit/settings.test.ts`, and wire
it in `extension.ts`.

## 7. Build / test / run commands

```bash
npm install            # install deps
npm run compile        # esbuild bundle -> dist/extension.js
npm run watch          # incremental bundle
npm run lint           # ESLint (must be clean)
npm run compile:tests  # tsc -> out/ (compiles src incl. tests)
npm run test:unit      # Mocha unit tests (fast, no vscode)
npm test               # @vscode/test-electron integration tests (downloads VS Code on first run; macOS launches natively)
npm run vsce:package   # build a .vsix (bundled, --no-dependencies)
npm run vsce:publish   # publish to marketplace (needs vsce login)
```

Debug in-editor: F5 → "Run Extension"; "Integration Tests" launch config debugs
the integration suite.

## 8. How to add a new feature (recipe)

1. Brainstorm/spec if non-trivial (see `docs/superpowers/`).
2. Create a **pure** module with the core logic + a unit test (TDD).
3. Create a thin provider/command module using the lazy-require pattern.
4. Add a setting (section 6) if it should be toggleable.
5. Wire it into `extension.ts` `registerFeatures` (toggle-guarded) and/or
   `activate` (for commands/watchers).
6. Add a fixture + integration test under `src/test/`.
7. Run `npm run lint && npm run test:unit && npm test`. All must pass.
8. Update `README.md` and `package.json` (`contributes`) as needed.

## 9. Known limitations / good follow-ups

These are deliberately deferred; pick them up as needed (verify with tests):

- **Java parsing is regex/line-based**, not a real AST:
  - `collectMethods` (in `javaClassResolver.ts`) scans to end-of-file, so a file
    with multiple top-level classes can mis-attribute methods to the first bean.
  - A single-line `@Service public class Foo {` is not detected (the stereotype
    match `continue`s before checking the class on the same line).
- **`typeCache`** in `extension.ts` (for `T(...)` navigation) is keyed by simple
  class name, is never cleared per-file on delete, and collides for same-named
  classes in different packages (the package in `T(pkg.Class)` is currently
  discarded — only the simple name reaches the resolver).
- **`extractPropertyKeyAt`** matches any `${...}` in a Java file, not strictly
  inside `@Value`. Low harm; tighten if needed.
- **`includeAll`** navigation returns a directory `LocationLink`; opening a
  folder via Go-to-Definition is best-effort (files work cleanly).
- **Integration coverage** is intentionally light (command registration, @Value
  nav, include nav). Consider adding @PreAuthorize/T(...) nav, a settings-toggle
  test, and a mock-driver SQL-execution test.
- `src/shared/workspaceCache.ts` from the original plan was never created;
  `BeanIndex` and `PropertyIndex` each implement their own `byName/byFile`
  bookkeeping. Extract a shared base only if it earns its keep.

## 10. Marketplace / release

- Publisher `SebastianGross`, MIT licensed (`LICENSE`), icon `media/levelups.png`.
- `package.json` carries `repository`, `author`, `keywords`, `icon`.
- Packaging uses esbuild bundling + `.vscodeignore`, so `vsce package
  --no-dependencies` produces a small `.vsix` (≈140 KB) containing
  `dist/extension.js`, both grammars, the icon, README, and LICENSE.
- Bump `version` in `package.json` per release.

## 11. Process docs

- Design spec: `docs/superpowers/specs/2026-06-09-vscode-levelups-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-09-vscode-levelups.md`

These describe the original MVP; this onboarding doc reflects the current,
evolved state and takes precedence where they differ.
