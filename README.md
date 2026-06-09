<p align="center">
  <img src="media/levelups.png" alt="VSCode Levelups" width="128" height="128" />
</p>

<h1 align="center">VSCode Levelups</h1>

<p align="center">
  Missing navigation, language intelligence, and Liquibase tooling for Java Spring Boot projects.
</p>

A VS Code extension that adds missing navigation, language intelligence, and
Liquibase tooling for Java Spring Boot projects.

The extension runs entirely in the background. It contributes **no custom views,
sidebars, webviews, or status bar items**. The only surfaces it uses are
standard VS Code "Go to Definition", a single command, an optional CodeLens, and
an output channel. Everything is controlled through `settings.json`, and every
feature is enabled by default.

## Installation

Install **VSCode Levelups** from the VS Code Marketplace (search for
"VSCode Levelups" in the Extensions view), or build a `.vsix` locally with
`npm run vsce:package` and install it via **Extensions: Install from VSIX…**.

## Features

### 1. Spring Security `@PreAuthorize` navigation
Ctrl/Cmd-Click inside SpEL expressions to jump to the referenced code:

- `@bean` → the bean's class
- `@bean.method(...)` → the method declaration
- `T(pkg.Class)` → the class/enum declaration

Beans are discovered from `@Service`, `@Component`, `@Repository`,
`@Controller`, `@RestController` (default and explicit names, including
fully-qualified annotations) and from `@Bean` factory methods.

SpEL expressions inside `@PreAuthorize` (and `@PostAuthorize`/`@PreFilter`/
`@PostFilter`) are syntax-highlighted — beans, method calls, `T(...)` types,
`#parameters`, logical operators and security functions are colored instead of
appearing as plain string text.

### 2. Spring `@Value` property navigation
Ctrl/Cmd-Click a property reference to jump to its declaration:

```java
@Value("${kks.retry-delay}")   // -> kks.retry-delay=1000
@Value("${kks.retry-delay:1000}") // default value is ignored
```

Indexed sources: `application*.properties`, `bootstrap*.properties`, and
`application*/bootstrap*.{yml,yaml}` (nested YAML keys are flattened to dotted
keys). When a key is defined in multiple files, VS Code shows a picker.

`${...}` placeholders inside `@Value` are syntax-highlighted: the placeholder
punctuation, the property key, and the `:default` portion are colored
distinctly.

### 3. Liquibase SQL highlighting
SQL embedded in Liquibase changelog XML (`<sql>...</sql>`) is highlighted as SQL
via a TextMate grammar injection — zero runtime cost.

### 4. Liquibase SQL execution
Place the cursor inside a `<sql>` block and run **Levelups: Execute SQL Block**
(or use the CodeLens above the block). The nearest SQL block is extracted, you
pick a target from a QuickPick listing every profile in
`vscodeLevelups.sql.connections` (shown as name + JDBC URL), and the SQL runs
against the selected connection; results are written to the **VSCode Levelups**
output channel. If no connections are configured, a prompt offers to open the
relevant setting.

> SQL execution ships with a built-in **mock driver** that simulates execution
> and reports affected rows. Real database drivers are intentionally not
> bundled. To execute against a real database, replace the driver via the
> `SqlDriver` extension point in `src/liquibase/sqlExecution.ts`
> (`interface SqlDriver { execute(sql, conn): Promise<SqlExecResult> }`).

### 5. Liquibase file-reference navigation
Ctrl/Cmd-click a path inside a changelog's `<include file="…">`,
`<sqlFile path="…">`, or `<includeAll path="…">` to jump to the referenced file
or directory. Paths are resolved relative to the current changelog when
`relativeToChangelogFile="true"`; otherwise common resource roots
(`src/main/resources`, `src/test/resources`) and the workspace folders are also
tried. Only targets that exist on disk are linked.

## Settings

| Setting | Default | Description |
|---|---|---|
| `vscodeLevelups.enablePreAuthorizeNavigation` | `true` | Navigation inside `@PreAuthorize` SpEL expressions. |
| `vscodeLevelups.enableValueNavigation` | `true` | Navigation from `@Value` to property definitions. |
| `vscodeLevelups.enableLiquibaseSqlExecution` | `true` | Allow executing SQL blocks from Liquibase XML. |
| `vscodeLevelups.enableLiquibaseFileNavigation` | `true` | Navigation from `include`/`includeAll`/`sqlFile` references to the referenced files. |
| `vscodeLevelups.sql.connections` | `[]` | SQL connection profiles (see below). |

Liquibase SQL highlighting is always on. It is delivered through a static
TextMate grammar injection contributed in `package.json`, which has zero runtime
cost and cannot be toggled at runtime, so it has no setting.

Connection profile shape:

```json
{
  "vscodeLevelups.sql.connections": [
    {
      "name": "DEV",
      "jdbcUrl": "jdbc:oracle:thin:@localhost:1521/XEPDB1",
      "username": "app",
      "password": "secret"
    }
  ]
}
```

Each feature can be toggled independently at runtime; flipping a setting
registers or disposes the relevant providers without a window reload.

## Architecture

```
src/
  extension.ts                 activation, indexing, feature registration
  settings/settings.ts         typed config accessors
  shared/                      logger, file watcher
  java/                        workspace scanner, class/method/type resolvers
  spring-security/             bean index, SpEL parser, PreAuthorize provider
  spring-properties/           property index, YAML flattening, @Value provider
  liquibase/                   detector, SQL extraction, execution, CodeLens, file refs
syntaxes/liquibase-sql.tmLanguage.json  SQL grammar injection (Liquibase XML)
syntaxes/spring-java.tmLanguage.json    @PreAuthorize / @Value grammar injection (Java)
```

Two cached indexes (beans, properties) are built once on activation and kept
fresh incrementally via file system watchers — no full rescans on edits.

Parsing is pure-JS (no native bindings): lightweight regex/line scanning is used
for the location lookups, which keeps the extension reliable across VS Code
versions and easy to test.

## Build & Run

```bash
npm install          # install dependencies
npm run compile      # bundle to dist/extension.js (esbuild)
npm run watch        # incremental bundle
npm run lint         # ESLint
npm run test:unit    # Mocha unit tests (parsers, indexes, providers)
npm test             # @vscode/test-electron integration tests
npm run vsce:package # build a .vsix (requires @vscode/vsce)
```

Press **F5** in VS Code (Run Extension) to launch an Extension Development Host.
Use the **Integration Tests** launch configuration to debug the integration
suite.

## Compatibility

Works alongside the Java Extension Pack / Red Hat Java extension. Supports Maven,
Gradle, multi-module, and multi-root workspaces. All providers are additive — VS
Code merges their results with those from other extensions.

## License

[MIT](LICENSE) © Sebastian Gross
