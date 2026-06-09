# vscode-levelups — Design Spec

Date: 2026-06-09
Status: Approved

## 1. Purpose

`vscode-levelups` is a VS Code extension that adds missing navigation, language
intelligence, and Liquibase tooling for Java Spring Boot projects. It runs
entirely in the background and behaves as if VS Code natively supported these
features.

Hard constraints:

- No custom views, sidebars, webviews, or status bar items.
- No custom UI beyond a standard `OutputChannel` and a single command.
- All behavior controlled via `settings.json`. All features enabled by default.
- Each feature independently enable/disable-able at runtime (no reload required).

## 2. Technology Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Language | TypeScript | VS Code standard |
| Bundler | esbuild | Fast, clean `.vsix` packaging |
| Java parsing | `java-parser` (pure JS) | No native bindings; reliable in CI/tests |
| YAML | `yaml` | Flatten nested keys |
| XML | `fast-xml-parser` | Liquibase changelog parsing/detection |
| SQL | `node-sql-parser` | Optional SQL validation/extraction |
| SQL execution | Pluggable `SqlDriver`, mock default | No heavyweight/native DB drivers; testable |
| Unit tests | Mocha (vscode API mocked) | Fast feedback on parsers/indexes |
| Integration tests | `@vscode/test-electron` | Real provider behavior |

## 3. Architecture

```
src
├── extension.ts                       # activation, feature registration, lifecycle
├── settings/settings.ts               # typed config accessors + change events
├── shared
│   ├── logger.ts                      # OutputChannel "VSCode Levelups"
│   ├── fileWatcher.ts                 # FileSystemWatcher wiring
│   └── workspaceCache.ts              # generic cached index base
├── java
│   ├── javaWorkspaceScanner.ts        # find + read **/*.java
│   ├── javaClassResolver.ts           # class/enum/annotation extraction
│   └── javaMethodResolver.ts          # method location extraction
├── spring-security
│   ├── beanIndex.ts                   # bean name -> BeanInfo
│   ├── spelParser.ts                  # parse SpEL tokens
│   └── preAuthorizeDefinitionProvider.ts
├── spring-properties
│   ├── propertyIndex.ts               # property key -> locations
│   ├── yamlResolver.ts                # flatten YAML to dotted keys
│   └── valueDefinitionProvider.ts
└── liquibase
    ├── liquibaseDetector.ts           # is-this-a-changelog check
    ├── sqlInjection.ts                # grammar injection helpers/constants
    ├── sqlExecution.ts                # command + SqlDriver abstraction
    └── liquibaseCodeLens.ts           # optional "Execute SQL Block" lens
syntaxes/liquibase-sql.tmLanguage.json # TextMate injection: source.sql into <sql>
```

### Activation

- `activationEvents`: `onLanguage:java`, `onLanguage:xml`, `workspaceContains:**/*.java`.
- On activate: read settings, build indexes lazily, register only enabled features.
- Config change listener registers/disposes providers per setting without reload.

### Indexing & performance

- Bean Index and Property Index built once on activation.
- Incremental refresh via `createFileSystemWatcher` on `onDidSave/Create/Delete`.
- Only changed files re-parsed; no full rescans on edits.
- Target: < 2s indexing for medium projects; instant navigation afterward.

## 4. Settings

```jsonc
{
  "vscodeLevelups.enablePreAuthorizeNavigation": true,
  "vscodeLevelups.enableValueNavigation": true,
  "vscodeLevelups.enableLiquibaseSqlHighlighting": true,
  "vscodeLevelups.enableLiquibaseSqlExecution": true,
  "vscodeLevelups.sql.connections": []
}
```

`sql.connections` entries: `{ name, jdbcUrl, username, password }`.

## 5. Feature 1 — @PreAuthorize Navigation

`DefinitionProvider` for `java`. On `provideDefinition`:

1. Confirm cursor is inside a `@PreAuthorize("...")` string (and string concatenation).
2. Parse the SpEL region with `spelParser`.
3. Resolve token under cursor:
   - `@bean` → bean class location.
   - `@bean.method(...)` → method location (bean lookup → method lookup).
   - `T(pkg.Class)` → class/enum location (clicking the simple type name).
   - `#param` → no navigation (reserved extension point).

**BeanInfo**

```ts
interface MethodInfo { name: string; filePath: string; line: number; column: number; }
interface BeanInfo { beanName: string; filePath: string; className: string; methods: MethodInfo[]; }
```

Bean detection: `@Service/@Component/@Repository/@Controller/@RestController`
(default name = class name with first char lowercased), explicit
`@Annotation("customName")`, and `@Bean` factory methods (bean name = method name).

## 6. Feature 2 — @Value Property Navigation

`DefinitionProvider` for `java`. Extract key via `\$\{([^}:]+)` from
`@Value("${...}")`, strip default after `:`, look up in Property Index, return
all matching locations (VS Code shows a picker for multiples).

Property files: `application*.properties`, `bootstrap*.properties`.
YAML files: `application*.{yml,yaml}`, `bootstrap*.{yml,yaml}` — flattened to
dotted keys with source line/column.

```ts
interface PropertyLocation { filePath: string; line: number; column: number; }
// index: Map<string, PropertyLocation[]>
```

Extension point reserved for `@ConfigurationProperties` (not in MVP).

## 7. Feature 3 — Liquibase SQL Highlighting

TextMate grammar **injection** (`syntaxes/liquibase-sql.tmLanguage.json`)
injecting `source.sql` into `<sql>...</sql>` and `<rollback><sql>...</sql>`
regions within XML. Zero runtime cost, no semantic token provider.

Contributed via `grammars` with `injectTo: ["text.xml"]`. Detection of actual
Liquibase files (root `<databaseChangeLog>` / namespace) handled by
`liquibaseDetector` for execution features; highlighting injection is scoped by
the `<sql>` tag pattern itself.

## 8. Feature 4 — Liquibase SQL Execution

- Active only when `enableLiquibaseSqlExecution` is true.
- Command `vscodeLevelups.executeSql`; optional CodeLens "Execute SQL Block".
- Flow: find nearest enclosing `<sql>` node → extract inner SQL → pick connection
  (first profile if one, otherwise quick pick) → run via `SqlDriver` → write
  result to OutputChannel ("Affected Rows: N" or error).

```ts
interface SqlConnection { name: string; jdbcUrl: string; username: string; password: string; }
interface SqlExecResult { affectedRows?: number; message?: string; error?: string; }
interface SqlDriver { execute(sql: string, conn: SqlConnection): Promise<SqlExecResult>; }
```

MVP ships `MockSqlDriver` (logs SQL + simulated affected rows). Real drivers are
a documented extension point; no native/DB dependencies bundled.

## 9. Compatibility

Coexists with Java Extension Pack / Red Hat Java. Supports Maven, Gradle,
multi-module and multi-root workspaces. Providers are additive (Go to
Definition merges results).

## 10. Testing Strategy

- **Unit (Mocha, vscode mocked):** spelParser tokens; bean detection & naming;
  property key extraction; YAML flattening; SQL block extraction; settings
  accessors; mock driver.
- **Integration (`@vscode/test-electron`):** definition providers resolve to
  correct locations on fixture projects; settings toggles register/dispose
  providers; command executes against mock driver.
- Fixtures under `src/test/fixtures/` (sample Spring/Liquibase files).

## 11. Build & Run

- `npm run compile` — esbuild bundle to `dist/extension.js`.
- `npm run watch` — incremental build.
- `npm run lint` — ESLint.
- `npm run test:unit` — Mocha unit tests.
- `npm run test` — `@vscode/test-electron` integration tests.
- `npm run package` — `vsce package` → `.vsix`.
- `.vscode/launch.json` — F5 to run Extension Development Host + debug tests.

## 12. Definition of Done

1. Ctrl+Click resolves bean references in `@PreAuthorize`.
2. Ctrl+Click resolves method references in `@PreAuthorize`.
3. Ctrl+Click resolves type references in `T(...)`.
4. Ctrl+Click resolves property names in `@Value`.
5. Liquibase `<sql>` sections highlighted as SQL.
6. SQL blocks executable from Liquibase XML (via pluggable driver).
7. Every feature independently toggleable via settings.
8. No custom UI.
9. Works in large Spring Boot workspaces (incremental indexing).
10. Behaves like a native VS Code capability.
