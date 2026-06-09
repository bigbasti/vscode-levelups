# vscode-levelups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a background VS Code extension adding @PreAuthorize/@Value navigation, Liquibase SQL highlighting, and pluggable Liquibase SQL execution for Java Spring Boot projects.

**Architecture:** TypeScript extension bundled with esbuild. Pure-JS parsing (`java-parser`, `yaml`, `fast-xml-parser`). Two cached workspace indexes (beans, properties) feed `DefinitionProvider`s. Liquibase highlighting via TextMate grammar injection. SQL execution behind a pluggable `SqlDriver` (mock default). All features gated by settings, registered/disposed at runtime.

**Tech Stack:** TypeScript, esbuild, Mocha + @vscode/test-electron, java-parser, yaml, fast-xml-parser, node-sql-parser.

---

## File Structure

```
package.json                              # manifest, contributes, scripts
tsconfig.json                             # TS config
esbuild.js                                # bundler script
.eslintrc.json                            # lint config
.vscode/launch.json                       # F5 debug + test config
.vscode/tasks.json                        # build tasks
.vscodeignore                             # package excludes
syntaxes/liquibase-sql.tmLanguage.json    # SQL grammar injection
language-configuration.xml.json           # (reuse default xml)

src/extension.ts                          # activation + feature wiring
src/settings/settings.ts                  # typed config + change events
src/shared/logger.ts                      # OutputChannel
src/shared/fileWatcher.ts                 # watcher helper
src/shared/workspaceCache.ts              # generic indexed cache base

src/java/javaWorkspaceScanner.ts          # find/read .java files
src/java/javaClassResolver.ts             # class/enum/annotation parsing
src/java/javaMethodResolver.ts            # method location parsing

src/spring-security/beanIndex.ts          # bean name -> BeanInfo
src/spring-security/spelParser.ts         # SpEL tokenizer
src/spring-security/preAuthorizeDefinitionProvider.ts

src/spring-properties/yamlResolver.ts     # flatten yaml
src/spring-properties/propertyIndex.ts    # key -> locations
src/spring-properties/valueDefinitionProvider.ts

src/liquibase/liquibaseDetector.ts        # changelog detection
src/liquibase/sqlInjection.ts             # grammar constants/helpers
src/liquibase/sqlExecution.ts             # command + SqlDriver
src/liquibase/liquibaseCodeLens.ts        # optional execute lens

src/test/unit/*.test.ts                   # mocha unit tests
src/test/integration/*.test.ts            # @vscode/test-electron tests
src/test/fixtures/**                       # sample project files
src/test/runUnit.ts                       # mocha unit runner
src/test/runIntegration.ts                # electron test entry
src/test/suite/index.ts                   # integration suite loader
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.js`, `.eslintrc.json`, `.vscodeignore`, `.vscode/launch.json`, `.vscode/tasks.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vscode-levelups",
  "displayName": "VSCode Levelups",
  "description": "Spring Boot navigation, property intelligence, and Liquibase tooling.",
  "version": "0.0.1",
  "publisher": "vscode-levelups",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Programming Languages", "Other"],
  "activationEvents": [
    "onLanguage:java",
    "onLanguage:xml",
    "workspaceContains:**/*.java"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "vscodeLevelups.executeSql",
        "title": "Levelups: Execute SQL Block"
      }
    ],
    "configuration": {
      "title": "VSCode Levelups",
      "properties": {
        "vscodeLevelups.enablePreAuthorizeNavigation": {
          "type": "boolean", "default": true,
          "description": "Enable navigation inside Spring Security PreAuthorize expressions."
        },
        "vscodeLevelups.enableValueNavigation": {
          "type": "boolean", "default": true,
          "description": "Enable navigation from @Value expressions to property definitions."
        },
        "vscodeLevelups.enableLiquibaseSqlHighlighting": {
          "type": "boolean", "default": true,
          "description": "Enable SQL syntax highlighting inside Liquibase changelog XML files."
        },
        "vscodeLevelups.enableLiquibaseSqlExecution": {
          "type": "boolean", "default": true,
          "description": "Allow execution of SQL blocks from Liquibase changelog files."
        },
        "vscodeLevelups.sql.connections": {
          "type": "array", "default": [],
          "description": "SQL connection profiles for Liquibase SQL execution.",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "jdbcUrl": { "type": "string" },
              "username": { "type": "string" },
              "password": { "type": "string" }
            }
          }
        }
      }
    },
    "grammars": [
      {
        "scopeName": "liquibase.sql.injection",
        "path": "./syntaxes/liquibase-sql.tmLanguage.json",
        "injectTo": ["text.xml"],
        "embeddedLanguages": { "meta.embedded.block.sql": "sql" }
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "package": "node esbuild.js --production",
    "lint": "eslint src --ext ts",
    "compile:tests": "tsc -p ./tsconfig.test.json",
    "test:unit": "npm run compile:tests && mocha out/test/unit/**/*.test.js",
    "test": "npm run compile:tests && node out/test/runIntegration.js",
    "vsce:package": "vsce package"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vscode/test-electron": "^2.3.9",
    "esbuild": "^0.20.0",
    "eslint": "^8.56.0",
    "mocha": "^10.3.0",
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "fast-xml-parser": "^4.3.0",
    "java-parser": "^2.3.0",
    "node-sql-parser": "^4.18.0",
    "yaml": "^2.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "lib": ["ES2021"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 3: Create `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "out" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `esbuild.js`**

```js
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "info",
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Create `.eslintrc.json`**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["out", "dist", "node_modules", "**/*.js"]
}
```

- [ ] **Step 6: Create `.vscodeignore`**

```
.vscode/**
src/**
out/**
node_modules/**
esbuild.js
tsconfig*.json
.eslintrc.json
docs/**
**/*.map
**/*.ts
```

- [ ] **Step 7: Create `.vscode/launch.json`**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: compile"
    },
    {
      "name": "Integration Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": ["${workspaceFolder}/out/test/**/*.js"],
      "preLaunchTask": "npm: compile:tests"
    }
  ]
}
```

- [ ] **Step 8: Create `.vscode/tasks.json`**

```json
{
  "version": "2.0.0",
  "tasks": [
    { "type": "npm", "script": "compile", "group": "build", "problemMatcher": [] },
    { "type": "npm", "script": "compile:tests", "group": "build", "problemMatcher": [] },
    { "type": "npm", "script": "watch", "isBackground": true, "problemMatcher": [] }
  ]
}
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: completes without native build errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold vscode-levelups extension project"
```

---

## Task 2: Shared logger + settings

**Files:**
- Create: `src/shared/logger.ts`, `src/settings/settings.ts`
- Test: `src/test/unit/settings.test.ts`

- [ ] **Step 1: Write failing test for settings**

`src/test/unit/settings.test.ts`:

```ts
import * as assert from "assert";
import { Settings } from "../../settings/settings";

// Minimal fake of vscode.workspace.getConfiguration
function fakeConfig(values: Record<string, unknown>) {
  return {
    get<T>(key: string, def: T): T {
      return (key in values ? values[key] : def) as T;
    },
  };
}

describe("Settings", () => {
  it("returns defaults when unset", () => {
    const s = new Settings(() => fakeConfig({}) as any);
    assert.strictEqual(s.enablePreAuthorizeNavigation, true);
    assert.strictEqual(s.enableValueNavigation, true);
    assert.strictEqual(s.enableLiquibaseSqlHighlighting, true);
    assert.strictEqual(s.enableLiquibaseSqlExecution, true);
    assert.deepStrictEqual(s.sqlConnections, []);
  });

  it("reads overridden values", () => {
    const s = new Settings(
      () => fakeConfig({ enablePreAuthorizeNavigation: false }) as any
    );
    assert.strictEqual(s.enablePreAuthorizeNavigation, false);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL ("Cannot find module ../../settings/settings").

- [ ] **Step 3: Implement `src/settings/settings.ts`**

```ts
export interface SqlConnection {
  name: string;
  jdbcUrl: string;
  username: string;
  password: string;
}

interface ConfigLike {
  get<T>(key: string, def: T): T;
}

export type ConfigProvider = () => ConfigLike;

const SECTION_KEYS = {
  preAuth: "enablePreAuthorizeNavigation",
  value: "enableValueNavigation",
  highlight: "enableLiquibaseSqlHighlighting",
  exec: "enableLiquibaseSqlExecution",
  conns: "sql.connections",
} as const;

export class Settings {
  constructor(private readonly provider: ConfigProvider) {}

  private cfg(): ConfigLike {
    return this.provider();
  }

  get enablePreAuthorizeNavigation(): boolean {
    return this.cfg().get(SECTION_KEYS.preAuth, true);
  }
  get enableValueNavigation(): boolean {
    return this.cfg().get(SECTION_KEYS.value, true);
  }
  get enableLiquibaseSqlHighlighting(): boolean {
    return this.cfg().get(SECTION_KEYS.highlight, true);
  }
  get enableLiquibaseSqlExecution(): boolean {
    return this.cfg().get(SECTION_KEYS.exec, true);
  }
  get sqlConnections(): SqlConnection[] {
    return this.cfg().get<SqlConnection[]>(SECTION_KEYS.conns, []);
  }
}

export function vscodeSettings(): Settings {
  // Lazy require so unit tests need not load vscode.
  const vscode = require("vscode");
  return new Settings(() => vscode.workspace.getConfiguration("vscodeLevelups"));
}
```

- [ ] **Step 4: Implement `src/shared/logger.ts`**

```ts
import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("VSCode Levelups");
  }
  return channel;
}

export function logInfo(message: string): void {
  getLogger().appendLine(`[info] ${message}`);
}

export function logError(message: string): void {
  getLogger().appendLine(`[error] ${message}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS (2 passing).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add settings accessors and shared logger"
```

---

## Task 3: SpEL parser

**Files:**
- Create: `src/spring-security/spelParser.ts`
- Test: `src/test/unit/spelParser.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/spelParser.test.ts`:

```ts
import * as assert from "assert";
import { parseSpel, SpelTokenKind } from "../../spring-security/spelParser";

describe("parseSpel", () => {
  it("parses bean and method call", () => {
    const tokens = parseSpel("@lptUserDetailService.userHasGroup(#id)");
    const bean = tokens.find((t) => t.kind === SpelTokenKind.Bean);
    const method = tokens.find((t) => t.kind === SpelTokenKind.Method);
    assert.ok(bean);
    assert.strictEqual(bean!.beanName, "lptUserDetailService");
    assert.ok(method);
    assert.strictEqual(method!.beanName, "lptUserDetailService");
    assert.strictEqual(method!.methodName, "userHasGroup");
  });

  it("parses bare bean reference", () => {
    const tokens = parseSpel("@lptUserDetailService");
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, SpelTokenKind.Bean);
    assert.strictEqual(tokens[0].beanName, "lptUserDetailService");
  });

  it("parses two method calls joined by or", () => {
    const tokens = parseSpel(
      "@svc.userHasGroup(#g) or @svc.isUserEqualToLoggedInUser(#id)"
    );
    const methods = tokens.filter((t) => t.kind === SpelTokenKind.Method);
    assert.strictEqual(methods.length, 2);
    assert.strictEqual(methods[0].methodName, "userHasGroup");
    assert.strictEqual(methods[1].methodName, "isUserEqualToLoggedInUser");
  });

  it("parses T(package.Class) type reference", () => {
    const tokens = parseSpel("T(de.telekom.lpt.model.UserGroup)");
    const type = tokens.find((t) => t.kind === SpelTokenKind.Type);
    assert.ok(type);
    assert.strictEqual(type!.fqcn, "de.telekom.lpt.model.UserGroup");
    assert.strictEqual(type!.simpleName, "UserGroup");
  });

  it("reports correct offsets within the expression", () => {
    const expr = "@svc.doThing(#id)";
    const tokens = parseSpel(expr);
    const method = tokens.find((t) => t.kind === SpelTokenKind.Method)!;
    assert.strictEqual(expr.slice(method.start, method.end), "doThing");
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL ("Cannot find module spelParser").

- [ ] **Step 3: Implement `src/spring-security/spelParser.ts`**

```ts
export enum SpelTokenKind {
  Bean = "bean",
  Method = "method",
  Type = "type",
  Param = "param",
}

export interface SpelToken {
  kind: SpelTokenKind;
  start: number; // offset within expression of the navigable identifier
  end: number;
  beanName?: string;
  methodName?: string;
  fqcn?: string;
  simpleName?: string;
  paramName?: string;
}

const BEAN_RE = /@([a-zA-Z_$][\w$]*)(?:\s*\.\s*([a-zA-Z_$][\w$]*))?/g;
const TYPE_RE = /T\(\s*([\w.]+)\s*\)/g;
const PARAM_RE = /#([a-zA-Z_$][\w$]*)/g;

export function parseSpel(expr: string): SpelToken[] {
  const tokens: SpelToken[] = [];

  let m: RegExpExecArray | null;

  BEAN_RE.lastIndex = 0;
  while ((m = BEAN_RE.exec(expr)) !== null) {
    const beanName = m[1];
    const methodName = m[2];
    const beanStart = m.index + 1; // skip '@'
    tokens.push({
      kind: SpelTokenKind.Bean,
      start: beanStart,
      end: beanStart + beanName.length,
      beanName,
    });
    if (methodName) {
      const methodStart = expr.indexOf(methodName, beanStart + beanName.length);
      tokens.push({
        kind: SpelTokenKind.Method,
        start: methodStart,
        end: methodStart + methodName.length,
        beanName,
        methodName,
      });
    }
  }

  TYPE_RE.lastIndex = 0;
  while ((m = TYPE_RE.exec(expr)) !== null) {
    const fqcn = m[1];
    const simpleName = fqcn.split(".").pop()!;
    const simpleStart = expr.indexOf(simpleName, m.index);
    tokens.push({
      kind: SpelTokenKind.Type,
      start: simpleStart,
      end: simpleStart + simpleName.length,
      fqcn,
      simpleName,
    });
  }

  PARAM_RE.lastIndex = 0;
  while ((m = PARAM_RE.exec(expr)) !== null) {
    const paramName = m[1];
    const start = m.index + 1;
    tokens.push({
      kind: SpelTokenKind.Param,
      start,
      end: start + paramName.length,
      paramName,
    });
  }

  return tokens.sort((a, b) => a.start - b.start);
}

/** Returns the token whose identifier range contains the given offset. */
export function tokenAtOffset(
  tokens: SpelToken[],
  offset: number
): SpelToken | undefined {
  return tokens.find((t) => offset >= t.start && offset <= t.end);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SpEL parser for PreAuthorize expressions"
```

---

## Task 4: Java parsing helpers (classes, beans, methods)

**Files:**
- Create: `src/java/javaClassResolver.ts`, `src/java/javaMethodResolver.ts`
- Test: `src/test/unit/javaResolver.test.ts`

Note: To keep parsing robust and fast we use line/regex scanning over Java source
(java-parser is available for future deep parsing but not required for these
location lookups). All functions take source text and return offsets/lines.

- [ ] **Step 1: Write failing test**

`src/test/unit/javaResolver.test.ts`:

```ts
import * as assert from "assert";
import {
  detectBeansInSource,
  defaultBeanName,
} from "../../java/javaClassResolver";
import { findMethodLocation } from "../../java/javaMethodResolver";

const SERVICE = `package de.telekom.lpt;

import org.springframework.stereotype.Service;

@Service
public class LptUserDetailService {
    public boolean userHasGroup(String g) {
        return true;
    }
    public boolean isUserEqualToLoggedInUser(Long id) {
        return false;
    }
}
`;

const NAMED = `@Component("customName")
public class SomeThing {}
`;

describe("defaultBeanName", () => {
  it("lowercases first char", () => {
    assert.strictEqual(defaultBeanName("LptUserDetailService"), "lptUserDetailService");
    assert.strictEqual(defaultBeanName("URLService"), "uRLService");
  });
});

describe("detectBeansInSource", () => {
  it("finds default-named service bean", () => {
    const beans = detectBeansInSource(SERVICE, "/x/LptUserDetailService.java");
    assert.strictEqual(beans.length, 1);
    assert.strictEqual(beans[0].beanName, "lptUserDetailService");
    assert.strictEqual(beans[0].className, "LptUserDetailService");
    assert.strictEqual(beans[0].methods.length, 2);
  });

  it("uses explicit bean name when provided", () => {
    const beans = detectBeansInSource(NAMED, "/x/SomeThing.java");
    assert.strictEqual(beans[0].beanName, "customName");
  });
});

describe("findMethodLocation", () => {
  it("returns line of method declaration", () => {
    const beans = detectBeansInSource(SERVICE, "/x/LptUserDetailService.java");
    const loc = findMethodLocation(beans[0], "isUserEqualToLoggedInUser");
    assert.ok(loc);
    assert.strictEqual(loc!.line, 9); // 0-based line index
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/java/javaClassResolver.ts`**

```ts
export interface MethodInfo {
  name: string;
  filePath: string;
  line: number; // 0-based
  column: number; // 0-based, points at method name
}

export interface BeanInfo {
  beanName: string;
  className: string;
  filePath: string;
  classLine: number;
  classColumn: number;
  methods: MethodInfo[];
}

const STEREOTYPES = [
  "Service",
  "Component",
  "Repository",
  "Controller",
  "RestController",
];

export function defaultBeanName(className: string): string {
  if (!className) return className;
  return className.charAt(0).toLowerCase() + className.slice(1);
}

const STEREOTYPE_RE = new RegExp(
  `@(${STEREOTYPES.join("|")})\\b(?:\\s*\\(\\s*(?:value\\s*=\\s*)?"([^"]+)"\\s*\\))?`
);
const CLASS_RE = /\b(?:public\s+|final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/;
const ENUM_RE = /\b(?:public\s+)?enum\s+([A-Za-z_$][\w$]*)/;
const METHOD_RE =
  /(?:public|protected|private)\s+(?:static\s+)?[\w<>\[\],?.\s]+?\s+([A-Za-z_$][\w$]*)\s*\(/;

export function detectBeansInSource(
  source: string,
  filePath: string
): BeanInfo[] {
  const lines = source.split(/\r?\n/);
  const beans: BeanInfo[] = [];

  let pendingName: string | undefined;
  let pendingStereotype = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const st = STEREOTYPE_RE.exec(line);
    if (st) {
      pendingStereotype = true;
      pendingName = st[2];
      continue;
    }
    const cls = CLASS_RE.exec(line);
    if (cls && pendingStereotype) {
      const className = cls[1];
      const methods = collectMethods(lines, i, filePath);
      beans.push({
        beanName: pendingName ?? defaultBeanName(className),
        className,
        filePath,
        classLine: i,
        classColumn: line.indexOf(className),
        methods,
      });
      pendingStereotype = false;
      pendingName = undefined;
    } else if (cls) {
      // class without stereotype on the preceding line resets pending
      pendingStereotype = false;
      pendingName = undefined;
    }
  }
  return beans;
}

function collectMethods(
  lines: string[],
  classLine: number,
  filePath: string
): MethodInfo[] {
  const methods: MethodInfo[] = [];
  for (let i = classLine + 1; i < lines.length; i++) {
    const m = METHOD_RE.exec(lines[i]);
    if (m && !lines[i].includes("class ") && !lines[i].includes("=")) {
      const name = m[1];
      methods.push({
        name,
        filePath,
        line: i,
        column: lines[i].indexOf(name),
      });
    }
  }
  return methods;
}

export interface TypeLocation {
  filePath: string;
  line: number;
  column: number;
}

export function findTypeInSource(
  source: string,
  filePath: string,
  simpleName: string
): TypeLocation | undefined {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cls = CLASS_RE.exec(lines[i]);
    const en = ENUM_RE.exec(lines[i]);
    if ((cls && cls[1] === simpleName) || (en && en[1] === simpleName)) {
      const col = lines[i].indexOf(simpleName);
      return { filePath, line: i, column: col };
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Implement `src/java/javaMethodResolver.ts`**

```ts
import { BeanInfo, MethodInfo } from "./javaClassResolver";

export function findMethodLocation(
  bean: BeanInfo,
  methodName: string
): MethodInfo | undefined {
  return bean.methods.find((m) => m.name === methodName);
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Java bean/method/type source resolvers"
```

---

## Task 5: Workspace scanner + bean index

**Files:**
- Create: `src/java/javaWorkspaceScanner.ts`, `src/spring-security/beanIndex.ts`
- Test: `src/test/unit/beanIndex.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/beanIndex.test.ts`:

```ts
import * as assert from "assert";
import { BeanIndex } from "../../spring-security/beanIndex";

const SERVICE = `@org.springframework.stereotype.Service
public class FooService {
  public void bar() {}
}
`;
const BEAN_FACTORY = `@Configuration
public class Cfg {
  @Bean
  public UserService userService() { return null; }
}
`;

describe("BeanIndex", () => {
  it("indexes stereotype beans and methods", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/FooService.java", SERVICE);
    const bean = idx.get("fooService");
    assert.ok(bean);
    assert.strictEqual(bean!.className, "FooService");
    assert.ok(bean!.methods.find((m) => m.name === "bar"));
  });

  it("indexes @Bean factory methods by method name", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/Cfg.java", BEAN_FACTORY);
    assert.ok(idx.get("userService"));
  });

  it("removes entries for a deleted file", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/FooService.java", SERVICE);
    idx.removeFile("/p/FooService.java");
    assert.strictEqual(idx.get("fooService"), undefined);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/java/javaWorkspaceScanner.ts`**

```ts
import * as vscode from "vscode";

export async function findJavaFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.java", "**/node_modules/**");
}

export async function readFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}
```

- [ ] **Step 4: Implement `src/spring-security/beanIndex.ts`**

```ts
import {
  BeanInfo,
  detectBeansInSource,
  MethodInfo,
} from "../java/javaClassResolver";

const BEAN_METHOD_RE =
  /@Bean\b[\s\S]*?\b([A-Za-z_$][\w$]*)\s*\(/g;

export class BeanIndex {
  private byName = new Map<string, BeanInfo>();
  private byFile = new Map<string, string[]>(); // filePath -> bean names

  get(beanName: string): BeanInfo | undefined {
    return this.byName.get(beanName);
  }

  all(): BeanInfo[] {
    return [...this.byName.values()];
  }

  updateFromSource(filePath: string, source: string): void {
    this.removeFile(filePath);
    const names: string[] = [];

    for (const bean of detectBeansInSource(source, filePath)) {
      this.byName.set(bean.beanName, bean);
      names.push(bean.beanName);
    }

    for (const bean of detectBeanFactoryMethods(source, filePath)) {
      this.byName.set(bean.beanName, bean);
      names.push(bean.beanName);
    }

    this.byFile.set(filePath, names);
  }

  removeFile(filePath: string): void {
    const names = this.byFile.get(filePath);
    if (names) {
      for (const n of names) {
        const existing = this.byName.get(n);
        if (existing && existing.filePath === filePath) {
          this.byName.delete(n);
        }
      }
      this.byFile.delete(filePath);
    }
  }

  clear(): void {
    this.byName.clear();
    this.byFile.clear();
  }
}

function detectBeanFactoryMethods(
  source: string,
  filePath: string
): BeanInfo[] {
  const lines = source.split(/\r?\n/);
  const beans: BeanInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/@Bean\b/.test(lines[i])) {
      // method declaration is on this or a following line
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const m = /\b([A-Za-z_$][\w$]*)\s*\(/.exec(lines[j]);
        if (m && !/@Bean/.test(lines[j].slice(m.index))) {
          const name = m[1];
          const method: MethodInfo = {
            name,
            filePath,
            line: j,
            column: lines[j].indexOf(name),
          };
          beans.push({
            beanName: name,
            className: name,
            filePath,
            classLine: j,
            classColumn: method.column,
            methods: [method],
          });
          break;
        }
      }
    }
  }
  return beans;
}
```

Note: `BEAN_METHOD_RE` is unused; remove it to satisfy lint. (Leave only
`detectBeanFactoryMethods`.)

- [ ] **Step 5: Remove the unused `BEAN_METHOD_RE` constant**

Delete the `BEAN_METHOD_RE` declaration from `beanIndex.ts`.

- [ ] **Step 6: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add workspace scanner and bean index"
```

---

## Task 6: PreAuthorize definition provider

**Files:**
- Create: `src/spring-security/preAuthorizeDefinitionProvider.ts`
- Test: `src/test/unit/preAuthorizeLogic.test.ts` (pure-logic helper)

The provider's vscode-dependent `provideDefinition` is thin; the navigable-target
resolution is a pure function we unit-test.

- [ ] **Step 1: Write failing test**

`src/test/unit/preAuthorizeLogic.test.ts`:

```ts
import * as assert from "assert";
import { BeanIndex } from "../../spring-security/beanIndex";
import { resolveSpelTarget } from "../../spring-security/preAuthorizeDefinitionProvider";

const SERVICE = `@org.springframework.stereotype.Service
public class SvcService {
  public boolean userHasGroup(String g) { return true; }
}
`;

describe("resolveSpelTarget", () => {
  const idx = new BeanIndex();
  idx.updateFromSource("/p/SvcService.java", SERVICE);
  const resolveType = (_n: string) => undefined;

  it("resolves method token to method location", () => {
    const target = resolveSpelTarget(
      "@svcService.userHasGroup(#g)",
      "userHasGroup".length + "@svcService.".length - 1,
      idx,
      resolveType
    );
    assert.ok(target);
    assert.strictEqual(target!.filePath, "/p/SvcService.java");
    assert.strictEqual(target!.line, 2);
  });

  it("resolves bean token to class location", () => {
    const target = resolveSpelTarget("@svcService", 3, idx, resolveType);
    assert.ok(target);
    assert.strictEqual(target!.line, 1);
  });

  it("returns undefined for unknown bean", () => {
    const target = resolveSpelTarget("@nope.x()", 2, idx, resolveType);
    assert.strictEqual(target, undefined);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/spring-security/preAuthorizeDefinitionProvider.ts`**

```ts
import * as vscode from "vscode";
import { BeanIndex } from "./beanIndex";
import { parseSpel, SpelTokenKind, tokenAtOffset } from "./spelParser";
import { findMethodLocation } from "../java/javaMethodResolver";

export interface TargetLocation {
  filePath: string;
  line: number;
  column: number;
}

export type TypeResolver = (simpleName: string) => TargetLocation | undefined;

/** Pure resolution: given a SpEL expression and an offset into it, find target. */
export function resolveSpelTarget(
  expr: string,
  offset: number,
  beans: BeanIndex,
  resolveType: TypeResolver
): TargetLocation | undefined {
  const tokens = parseSpel(expr);
  const token = tokenAtOffset(tokens, offset);
  if (!token) return undefined;

  if (token.kind === SpelTokenKind.Bean && token.beanName) {
    const bean = beans.get(token.beanName);
    if (!bean) return undefined;
    return { filePath: bean.filePath, line: bean.classLine, column: bean.classColumn };
  }

  if (token.kind === SpelTokenKind.Method && token.beanName && token.methodName) {
    const bean = beans.get(token.beanName);
    if (!bean) return undefined;
    const method = findMethodLocation(bean, token.methodName);
    if (!method) return undefined;
    return { filePath: method.filePath, line: method.line, column: method.column };
  }

  if (token.kind === SpelTokenKind.Type && token.simpleName) {
    return resolveType(token.simpleName);
  }

  return undefined;
}

const PREAUTH_RE = /@PreAuthorize\s*\(/;

/**
 * Finds the @PreAuthorize string region the cursor sits inside and returns the
 * concatenated literal contents plus the offset of the cursor within it.
 */
export function extractPreAuthorizeContext(
  fullText: string,
  cursorOffset: number
): { expr: string; offsetInExpr: number } | undefined {
  const annoIdx = fullText.lastIndexOf("@PreAuthorize", cursorOffset);
  if (annoIdx === -1) return undefined;
  if (!PREAUTH_RE.test(fullText.slice(annoIdx, annoIdx + 20))) return undefined;

  // Find the closing paren of the annotation from annoIdx.
  const open = fullText.indexOf("(", annoIdx);
  if (open === -1 || cursorOffset < open) return undefined;
  let depth = 0;
  let close = -1;
  for (let i = open; i < fullText.length; i++) {
    const c = fullText[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1 || cursorOffset > close) return undefined;

  // Concatenate string literals within (open, close), tracking mapping back to
  // source offsets so we can translate cursor position.
  const region = fullText.slice(open + 1, close);
  const literalRe = /"((?:[^"\\]|\\.)*)"/g;
  let expr = "";
  let offsetInExpr = -1;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(region)) !== null) {
    const contentStartInSource = open + 1 + m.index + 1;
    const content = m[1];
    if (
      cursorOffset >= contentStartInSource &&
      cursorOffset <= contentStartInSource + content.length
    ) {
      offsetInExpr = expr.length + (cursorOffset - contentStartInSource);
    }
    expr += content;
  }
  if (offsetInExpr === -1) return undefined;
  return { expr, offsetInExpr };
}

export class PreAuthorizeDefinitionProvider
  implements vscode.DefinitionProvider
{
  constructor(
    private readonly beans: BeanIndex,
    private readonly resolveType: TypeResolver
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const ctx = extractPreAuthorizeContext(text, offset);
    if (!ctx) return undefined;

    const target = resolveSpelTarget(
      ctx.expr,
      ctx.offsetInExpr,
      this.beans,
      this.resolveType
    );
    if (!target) return undefined;

    return new vscode.Location(
      vscode.Uri.file(target.filePath),
      new vscode.Position(target.line, target.column)
    );
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PreAuthorize definition provider"
```

---

## Task 7: YAML flatten + property index

**Files:**
- Create: `src/spring-properties/yamlResolver.ts`, `src/spring-properties/propertyIndex.ts`
- Test: `src/test/unit/propertyIndex.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/propertyIndex.test.ts`:

```ts
import * as assert from "assert";
import { flattenYaml } from "../../spring-properties/yamlResolver";
import { PropertyIndex } from "../../spring-properties/propertyIndex";

describe("flattenYaml", () => {
  it("flattens nested keys with line numbers", () => {
    const yaml = "kks:\n  retry-delay: 1000\n  inner:\n    val: x\n";
    const entries = flattenYaml(yaml);
    const rd = entries.find((e) => e.key === "kks.retry-delay");
    assert.ok(rd);
    assert.strictEqual(rd!.line, 1);
    assert.ok(entries.find((e) => e.key === "kks.inner.val"));
  });
});

describe("PropertyIndex", () => {
  it("indexes .properties keys", () => {
    const idx = new PropertyIndex();
    idx.updateFromSource("/a/application.properties", "kks.retry-delay=1000\n");
    const locs = idx.get("kks.retry-delay");
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(locs[0].line, 0);
  });

  it("returns multiple locations across files", () => {
    const idx = new PropertyIndex();
    idx.updateFromSource("/a/application.properties", "k=1\n");
    idx.updateFromSource("/a/application-dev.properties", "k=2\n");
    assert.strictEqual(idx.get("k").length, 2);
  });

  it("indexes yaml keys", () => {
    const idx = new PropertyIndex();
    idx.updateFromSource("/a/application.yml", "kks:\n  retry-delay: 1000\n");
    assert.strictEqual(idx.get("kks.retry-delay").length, 1);
  });

  it("removes file entries", () => {
    const idx = new PropertyIndex();
    idx.updateFromSource("/a/application.properties", "k=1\n");
    idx.removeFile("/a/application.properties");
    assert.strictEqual(idx.get("k").length, 0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/spring-properties/yamlResolver.ts`**

```ts
import { parseDocument, isMap, isScalar, isPair } from "yaml";

export interface YamlEntry {
  key: string;
  line: number; // 0-based
  column: number; // 0-based
}

export function flattenYaml(text: string): YamlEntry[] {
  const doc = parseDocument(text);
  const entries: YamlEntry[] = [];
  const lineCounter = doc.lineCounter ?? undefined;

  // Build a manual line index from offsets.
  const offsetToPos = makeOffsetToPos(text);

  function walk(node: unknown, prefix: string): void {
    if (isMap(node)) {
      for (const item of node.items) {
        if (!isPair(item)) continue;
        const keyNode: any = item.key;
        const keyStr = String(keyNode?.value ?? "");
        const full = prefix ? `${prefix}.${keyStr}` : keyStr;
        const range = keyNode?.range as [number, number] | undefined;
        if (isMap(item.value)) {
          walk(item.value, full);
        } else {
          if (range) {
            const pos = offsetToPos(range[0]);
            entries.push({ key: full, line: pos.line, column: pos.column });
          } else {
            entries.push({ key: full, line: 0, column: 0 });
          }
        }
      }
    }
  }

  void lineCounter;
  void isScalar;
  walk(doc.contents, "");
  return entries;
}

function makeOffsetToPos(text: string) {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, column: offset - lineStarts[lo] };
  };
}
```

- [ ] **Step 4: Implement `src/spring-properties/propertyIndex.ts`**

```ts
import { flattenYaml } from "./yamlResolver";

export interface PropertyLocation {
  filePath: string;
  line: number; // 0-based
  column: number; // 0-based
}

export class PropertyIndex {
  private byKey = new Map<string, PropertyLocation[]>();
  private byFile = new Map<string, string[]>();

  get(key: string): PropertyLocation[] {
    return this.byKey.get(key) ?? [];
  }

  updateFromSource(filePath: string, source: string): void {
    this.removeFile(filePath);
    const keys: string[] = [];
    const isYaml = /\.ya?ml$/i.test(filePath);
    const locs = isYaml
      ? parsePropertiesFromYaml(filePath, source)
      : parsePropertiesFile(filePath, source);

    for (const { key, loc } of locs) {
      const arr = this.byKey.get(key) ?? [];
      arr.push(loc);
      this.byKey.set(key, arr);
      keys.push(key);
    }
    this.byFile.set(filePath, keys);
  }

  removeFile(filePath: string): void {
    const keys = this.byFile.get(filePath);
    if (!keys) return;
    for (const key of keys) {
      const arr = this.byKey.get(key);
      if (!arr) continue;
      const filtered = arr.filter((l) => l.filePath !== filePath);
      if (filtered.length) this.byKey.set(key, filtered);
      else this.byKey.delete(key);
    }
    this.byFile.delete(filePath);
  }

  clear(): void {
    this.byKey.clear();
    this.byFile.clear();
  }
}

function parsePropertiesFile(
  filePath: string,
  source: string
): { key: string; loc: PropertyLocation }[] {
  const out: { key: string; loc: PropertyLocation }[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = line.search(/[=:]/);
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    out.push({
      key,
      loc: { filePath, line: i, column: line.indexOf(key) },
    });
  }
  return out;
}

function parsePropertiesFromYaml(
  filePath: string,
  source: string
): { key: string; loc: PropertyLocation }[] {
  return flattenYaml(source).map((e) => ({
    key: e.key,
    loc: { filePath, line: e.line, column: e.column },
  }));
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add YAML flattening and property index"
```

---

## Task 8: @Value definition provider

**Files:**
- Create: `src/spring-properties/valueDefinitionProvider.ts`
- Test: `src/test/unit/valueLogic.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/valueLogic.test.ts`:

```ts
import * as assert from "assert";
import { extractPropertyKeyAt } from "../../spring-properties/valueDefinitionProvider";

describe("extractPropertyKeyAt", () => {
  it("extracts key without default", () => {
    const text = '@Value("${kks.retry-delay}")';
    const offset = text.indexOf("retry");
    assert.strictEqual(extractPropertyKeyAt(text, offset), "kks.retry-delay");
  });

  it("extracts key ignoring default value", () => {
    const text = '@Value("${kks.retry-delay:1000}")';
    const offset = text.indexOf("retry");
    assert.strictEqual(extractPropertyKeyAt(text, offset), "kks.retry-delay");
  });

  it("returns undefined outside any placeholder", () => {
    const text = 'String x = "plain";';
    assert.strictEqual(extractPropertyKeyAt(text, 5), undefined);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/spring-properties/valueDefinitionProvider.ts`**

```ts
import * as vscode from "vscode";
import { PropertyIndex } from "./propertyIndex";

/**
 * If the given offset is inside a ${...} placeholder, return the property key
 * (without any :default suffix). Otherwise undefined.
 */
export function extractPropertyKeyAt(
  text: string,
  offset: number
): string | undefined {
  const open = text.lastIndexOf("${", offset);
  if (open === -1) return undefined;
  const close = text.indexOf("}", open);
  if (close === -1 || offset > close) return undefined;
  const inner = text.slice(open + 2, close);
  const key = inner.split(":")[0].trim();
  return key.length ? key : undefined;
}

export class ValueDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly properties: PropertyIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const key = extractPropertyKeyAt(text, offset);
    if (!key) return undefined;

    const locs = this.properties.get(key);
    if (!locs.length) return undefined;

    return locs.map(
      (l) =>
        new vscode.Location(
          vscode.Uri.file(l.filePath),
          new vscode.Position(l.line, l.column)
        )
    );
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add @Value property definition provider"
```

---

## Task 9: Liquibase detector + SQL block extraction + grammar

**Files:**
- Create: `src/liquibase/liquibaseDetector.ts`, `src/liquibase/sqlInjection.ts`, `syntaxes/liquibase-sql.tmLanguage.json`
- Test: `src/test/unit/liquibase.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/liquibase.test.ts`:

```ts
import * as assert from "assert";
import { isLiquibaseChangelog } from "../../liquibase/liquibaseDetector";
import { findEnclosingSqlBlock } from "../../liquibase/sqlInjection";

const CHANGELOG = `<?xml version="1.0"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="1" author="x">
    <sql>
      INSERT INTO t(a) VALUES (1);
    </sql>
  </changeSet>
</databaseChangeLog>
`;

describe("isLiquibaseChangelog", () => {
  it("detects databaseChangeLog root", () => {
    assert.strictEqual(isLiquibaseChangelog(CHANGELOG), true);
  });
  it("rejects plain xml", () => {
    assert.strictEqual(isLiquibaseChangelog("<root><a/></root>"), false);
  });
});

describe("findEnclosingSqlBlock", () => {
  it("returns inner SQL when offset is inside a <sql> block", () => {
    const offset = CHANGELOG.indexOf("INSERT");
    const block = findEnclosingSqlBlock(CHANGELOG, offset);
    assert.ok(block);
    assert.ok(block!.sql.includes("INSERT INTO t(a) VALUES (1);"));
  });
  it("returns undefined when offset is outside any <sql>", () => {
    const offset = CHANGELOG.indexOf("changeSet");
    assert.strictEqual(findEnclosingSqlBlock(CHANGELOG, offset), undefined);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/liquibase/liquibaseDetector.ts`**

```ts
export function isLiquibaseChangelog(xml: string): boolean {
  if (/<databaseChangeLog\b/.test(xml)) return true;
  if (/liquibase\.org\/xml\/ns\/dbchangelog/.test(xml)) return true;
  return false;
}
```

- [ ] **Step 4: Implement `src/liquibase/sqlInjection.ts`**

```ts
export interface SqlBlock {
  sql: string;
  innerStart: number; // offset in document of inner content start
  innerEnd: number; // offset of inner content end
}

const OPEN_TAG_RE = /<sql\b[^>]*>/g;

/**
 * Find the <sql>...</sql> block that encloses the given offset, if any.
 * Ignores self-closing <sqlFile .../> tags.
 */
export function findEnclosingSqlBlock(
  xml: string,
  offset: number
): SqlBlock | undefined {
  OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG_RE.exec(xml)) !== null) {
    if (m[0].endsWith("/>")) continue;
    const innerStart = m.index + m[0].length;
    const closeIdx = xml.indexOf("</sql>", innerStart);
    if (closeIdx === -1) continue;
    if (offset >= innerStart && offset <= closeIdx) {
      return {
        sql: xml.slice(innerStart, closeIdx).trim(),
        innerStart,
        innerEnd: closeIdx,
      };
    }
  }
  return undefined;
}
```

- [ ] **Step 5: Create `syntaxes/liquibase-sql.tmLanguage.json`**

```json
{
  "scopeName": "liquibase.sql.injection",
  "injectionSelector": "L:text.xml -comment -string",
  "patterns": [{ "include": "#sql-block" }],
  "repository": {
    "sql-block": {
      "begin": "(<)(sql)(>)",
      "beginCaptures": {
        "1": { "name": "punctuation.definition.tag.xml" },
        "2": { "name": "entity.name.tag.xml" },
        "3": { "name": "punctuation.definition.tag.xml" }
      },
      "end": "(</)(sql)(>)",
      "endCaptures": {
        "1": { "name": "punctuation.definition.tag.xml" },
        "2": { "name": "entity.name.tag.xml" },
        "3": { "name": "punctuation.definition.tag.xml" }
      },
      "contentName": "meta.embedded.block.sql",
      "patterns": [{ "include": "source.sql" }]
    }
  }
}
```

- [ ] **Step 6: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Manual highlight check (documented, not automated)**

Open the Extension Development Host (F5), open a `.xml` changelog with a `<sql>`
block, confirm SQL keywords are colorized. Record result in commit message.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Liquibase detection, SQL block extraction, grammar injection"
```

---

## Task 10: SQL execution (pluggable driver + command)

**Files:**
- Create: `src/liquibase/sqlExecution.ts`, `src/liquibase/liquibaseCodeLens.ts`
- Test: `src/test/unit/sqlExecution.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/unit/sqlExecution.test.ts`:

```ts
import * as assert from "assert";
import { MockSqlDriver, pickConnection } from "../../liquibase/sqlExecution";

describe("MockSqlDriver", () => {
  it("returns simulated affected rows", async () => {
    const driver = new MockSqlDriver();
    const res = await driver.execute("INSERT INTO t VALUES (1)", {
      name: "DEV",
      jdbcUrl: "jdbc:x",
      username: "u",
      password: "p",
    });
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(typeof res.affectedRows, "number");
  });
});

describe("pickConnection", () => {
  it("returns the only connection without prompting", async () => {
    const conn = { name: "DEV", jdbcUrl: "j", username: "u", password: "p" };
    const chosen = await pickConnection([conn], async () => {
      throw new Error("should not prompt");
    });
    assert.strictEqual(chosen, conn);
  });

  it("prompts when multiple connections exist", async () => {
    const a = { name: "A", jdbcUrl: "j", username: "u", password: "p" };
    const b = { name: "B", jdbcUrl: "j", username: "u", password: "p" };
    const chosen = await pickConnection([a, b], async (conns) => conns[1]);
    assert.strictEqual(chosen, b);
  });

  it("returns undefined when no connections", async () => {
    const chosen = await pickConnection([], async () => undefined);
    assert.strictEqual(chosen, undefined);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test:unit`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/liquibase/sqlExecution.ts`**

```ts
import * as vscode from "vscode";
import { SqlConnection } from "../settings/settings";
import { findEnclosingSqlBlock } from "./sqlInjection";
import { logError, logInfo, getLogger } from "../shared/logger";

export interface SqlExecResult {
  affectedRows?: number;
  message?: string;
  error?: string;
}

export interface SqlDriver {
  execute(sql: string, conn: SqlConnection): Promise<SqlExecResult>;
}

/** Default driver: simulates execution, logs SQL. Replace via extension point. */
export class MockSqlDriver implements SqlDriver {
  async execute(sql: string, conn: SqlConnection): Promise<SqlExecResult> {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      affectedRows: statements.length,
      message: `Simulated execution against ${conn.name}`,
    };
  }
}

export type ConnectionPicker = (
  conns: SqlConnection[]
) => Promise<SqlConnection | undefined>;

export async function pickConnection(
  conns: SqlConnection[],
  prompt: ConnectionPicker
): Promise<SqlConnection | undefined> {
  if (conns.length === 0) return undefined;
  if (conns.length === 1) return conns[0];
  return prompt(conns);
}

async function defaultPrompt(
  conns: SqlConnection[]
): Promise<SqlConnection | undefined> {
  const choice = await vscode.window.showQuickPick(
    conns.map((c) => c.name),
    { placeHolder: "Select SQL connection" }
  );
  return conns.find((c) => c.name === choice);
}

export interface ExecuteSqlDeps {
  driver: SqlDriver;
  getConnections: () => SqlConnection[];
  prompt?: ConnectionPicker;
}

/** Command handler for vscodeLevelups.executeSql. */
export async function executeSqlCommand(deps: ExecuteSqlDeps): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor.");
    return;
  }
  const text = editor.document.getText();
  const offset = editor.document.offsetAt(editor.selection.active);
  const block = findEnclosingSqlBlock(text, offset);
  if (!block) {
    vscode.window.showWarningMessage("Cursor is not inside a <sql> block.");
    return;
  }

  const conn = await pickConnection(
    deps.getConnections(),
    deps.prompt ?? defaultPrompt
  );
  if (!conn) {
    vscode.window.showWarningMessage(
      "No SQL connection configured (vscodeLevelups.sql.connections)."
    );
    return;
  }

  getLogger().show(true);
  logInfo(`Executing SQL against ${conn.name}:`);
  logInfo(block.sql);
  try {
    const res = await deps.driver.execute(block.sql, conn);
    if (res.error) {
      logError(res.error);
    } else {
      logInfo(`Affected Rows: ${res.affectedRows ?? 0}`);
      if (res.message) logInfo(res.message);
    }
  } catch (e: any) {
    logError(String(e?.message ?? e));
  }
}
```

- [ ] **Step 4: Implement `src/liquibase/liquibaseCodeLens.ts`**

```ts
import * as vscode from "vscode";
import { isLiquibaseChangelog } from "./liquibaseDetector";

const OPEN_SQL_RE = /<sql\b[^>]*>/g;

export class LiquibaseCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | undefined {
    const text = document.getText();
    if (!isLiquibaseChangelog(text)) return undefined;

    const lenses: vscode.CodeLens[] = [];
    let m: RegExpExecArray | null;
    OPEN_SQL_RE.lastIndex = 0;
    while ((m = OPEN_SQL_RE.exec(text)) !== null) {
      if (m[0].endsWith("/>")) continue;
      const pos = document.positionAt(m.index);
      lenses.push(
        new vscode.CodeLens(new vscode.Range(pos, pos), {
          title: "Execute SQL Block",
          command: "vscodeLevelups.executeSql",
        })
      );
    }
    return lenses;
  }
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add pluggable SQL execution command and CodeLens"
```

---

## Task 11: File watcher helper

**Files:**
- Create: `src/shared/fileWatcher.ts`
- Test: covered via extension integration (no unit test; thin vscode wrapper)

- [ ] **Step 1: Implement `src/shared/fileWatcher.ts`**

```ts
import * as vscode from "vscode";

export interface WatchHandlers {
  onChange: (uri: vscode.Uri) => void;
  onDelete: (uri: vscode.Uri) => void;
}

export function createWatcher(
  glob: string,
  handlers: WatchHandlers
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(glob);
  watcher.onDidCreate(handlers.onChange);
  watcher.onDidChange(handlers.onChange);
  watcher.onDidDelete(handlers.onDelete);
  return watcher;
}
```

- [ ] **Step 2: Compile check**

Run: `npm run compile:tests`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add file system watcher helper"
```

---

## Task 12: Extension activation wiring

**Files:**
- Create: `src/extension.ts`
- Modify: none

- [ ] **Step 1: Implement `src/extension.ts`**

```ts
import * as vscode from "vscode";
import { vscodeSettings, Settings } from "./settings/settings";
import { logInfo, disposeLogger } from "./shared/logger";
import { createWatcher } from "./shared/fileWatcher";
import { findJavaFiles, readFile } from "./java/javaWorkspaceScanner";
import { findTypeInSource } from "./java/javaClassResolver";
import { BeanIndex } from "./spring-security/beanIndex";
import {
  PreAuthorizeDefinitionProvider,
  TargetLocation,
} from "./spring-security/preAuthorizeDefinitionProvider";
import { PropertyIndex } from "./spring-properties/propertyIndex";
import { ValueDefinitionProvider } from "./spring-properties/valueDefinitionProvider";
import {
  MockSqlDriver,
  executeSqlCommand,
} from "./liquibase/sqlExecution";
import { LiquibaseCodeLensProvider } from "./liquibase/liquibaseCodeLens";

const JAVA_SELECTOR: vscode.DocumentSelector = { language: "java" };
const XML_SELECTOR: vscode.DocumentSelector = { language: "xml" };
const PROPERTY_GLOB =
  "**/{application,bootstrap}*.{properties,yml,yaml}";

let featureDisposables: vscode.Disposable[] = [];

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const settings = vscodeSettings();
  const beanIndex = new BeanIndex();
  const propertyIndex = new PropertyIndex();

  logInfo("vscode-levelups activating");

  await buildBeanIndex(beanIndex);
  await buildPropertyIndex(propertyIndex);

  // Watchers keep indexes fresh (always active; cheap).
  context.subscriptions.push(
    createWatcher("**/*.java", {
      onChange: async (uri) =>
        beanIndex.updateFromSource(uri.fsPath, await readFile(uri)),
      onDelete: (uri) => beanIndex.removeFile(uri.fsPath),
    }),
    createWatcher(PROPERTY_GLOB, {
      onChange: async (uri) =>
        propertyIndex.updateFromSource(uri.fsPath, await readFile(uri)),
      onDelete: (uri) => propertyIndex.removeFile(uri.fsPath),
    })
  );

  // Always register the command; gate behavior on settings at invoke time.
  context.subscriptions.push(
    vscode.commands.registerCommand("vscodeLevelups.executeSql", async () => {
      const s = vscodeSettings();
      if (!s.enableLiquibaseSqlExecution) {
        vscode.window.showInformationMessage(
          "Liquibase SQL execution is disabled in settings."
        );
        return;
      }
      await executeSqlCommand({
        driver: new MockSqlDriver(),
        getConnections: () => s.sqlConnections,
      });
    })
  );

  registerFeatures(settings, beanIndex, propertyIndex, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vscodeLevelups")) {
        registerFeatures(settings, beanIndex, propertyIndex, context);
      }
    })
  );
}

function registerFeatures(
  settings: Settings,
  beanIndex: BeanIndex,
  propertyIndex: PropertyIndex,
  context: vscode.ExtensionContext
): void {
  // Dispose previously registered feature providers.
  for (const d of featureDisposables) d.dispose();
  featureDisposables = [];

  if (settings.enablePreAuthorizeNavigation) {
    const resolveType = (simpleName: string): TargetLocation | undefined => {
      for (const bean of beanIndex.all()) {
        // bean class file may also contain the type; cheap reuse not enough,
        // so we scan all java files lazily through findTypeInSource on demand.
      }
      return resolveTypeAcrossWorkspaceSync(simpleName);
    };
    featureDisposables.push(
      vscode.languages.registerDefinitionProvider(
        JAVA_SELECTOR,
        new PreAuthorizeDefinitionProvider(beanIndex, resolveType)
      )
    );
  }

  if (settings.enableValueNavigation) {
    featureDisposables.push(
      vscode.languages.registerDefinitionProvider(
        JAVA_SELECTOR,
        new ValueDefinitionProvider(propertyIndex)
      )
    );
  }

  if (settings.enableLiquibaseSqlExecution) {
    featureDisposables.push(
      vscode.languages.registerCodeLensProvider(
        XML_SELECTOR,
        new LiquibaseCodeLensProvider()
      )
    );
  }

  context.subscriptions.push(...featureDisposables);
}

// --- Type resolution cache (for T(pkg.Class)) ---

const typeCache = new Map<string, TargetLocation>();

function resolveTypeAcrossWorkspaceSync(
  simpleName: string
): TargetLocation | undefined {
  return typeCache.get(simpleName);
}

async function buildBeanIndex(beanIndex: BeanIndex): Promise<void> {
  const files = await findJavaFiles();
  for (const uri of files) {
    const src = await readFile(uri);
    beanIndex.updateFromSource(uri.fsPath, src);
    // Cache type (class/enum) locations for T(...) navigation.
    cacheTypesFromSource(uri.fsPath, src);
  }
}

function cacheTypesFromSource(filePath: string, src: string): void {
  // Index simple class/enum names declared in this file.
  const decl = /\b(?:class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src)) !== null) {
    const name = m[1];
    const loc = findTypeInSource(src, filePath, name);
    if (loc) typeCache.set(name, loc);
  }
}

async function buildPropertyIndex(
  propertyIndex: PropertyIndex
): Promise<void> {
  const files = await vscode.workspace.findFiles(
    PROPERTY_GLOB,
    "**/node_modules/**"
  );
  for (const uri of files) {
    propertyIndex.updateFromSource(uri.fsPath, await readFile(uri));
  }
}

export function deactivate(): void {
  for (const d of featureDisposables) d.dispose();
  featureDisposables = [];
  disposeLogger();
}
```

- [ ] **Step 2: Remove dead loop in `resolveType`**

In `registerFeatures`, replace the `resolveType` closure body that contains the
empty `for` loop with a direct call:

```ts
    const resolveType = (simpleName: string): TargetLocation | undefined =>
      resolveTypeAcrossWorkspaceSync(simpleName);
```

- [ ] **Step 3: Compile**

Run: `npm run compile`
Expected: `dist/extension.js` produced, no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire extension activation, indexing, and feature registration"
```

---

## Task 13: Integration test harness + fixtures

**Files:**
- Create: `src/test/runIntegration.ts`, `src/test/suite/index.ts`, `src/test/integration/extension.test.ts`, fixtures under `src/test/fixtures/`

- [ ] **Step 1: Create fixtures**

`src/test/fixtures/src/SvcService.java`:

```java
package demo;
import org.springframework.stereotype.Service;

@Service
public class SvcService {
    public boolean userHasGroup(String g) { return true; }
}
```

`src/test/fixtures/src/UseSvc.java`:

```java
package demo;
import org.springframework.security.access.prepost.PreAuthorize;

public class UseSvc {
    @PreAuthorize("@svcService.userHasGroup('A')")
    public void doIt() {}
}
```

`src/test/fixtures/src/application.properties`:

```
kks.retry-delay=1000
```

`src/test/fixtures/changelog.xml`:

```xml
<?xml version="1.0"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="1" author="x">
    <sql>INSERT INTO t(a) VALUES (1);</sql>
  </changeSet>
</databaseChangeLog>
```

- [ ] **Step 2: Create `src/test/runIntegration.ts`**

```ts
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    const fixtures = path.resolve(__dirname, "./fixtures");
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [fixtures, "--disable-extensions"],
    });
  } catch (err) {
    console.error("Integration tests failed", err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 3: Create `src/test/suite/index.ts`**

```ts
import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname, "..");
  const files = await glob("integration/**/*.test.js", { cwd: testsRoot });
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} tests failed`)) : resolve()
    );
  });
}
```

- [ ] **Step 4: Add `glob` dev dependency**

Run: `npm install -D glob@^10`
Expected: installs.

- [ ] **Step 5: Create `src/test/integration/extension.test.ts`**

```ts
import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

async function openFixture(rel: string): Promise<vscode.TextDocument> {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(folder, rel);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

describe("Integration", () => {
  it("activates and registers executeSql command", async () => {
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes("vscodeLevelups.executeSql"));
  });

  it("navigates @Value property to definition", async () => {
    // Allow activation + indexing to settle.
    await new Promise((r) => setTimeout(r, 1500));
    const doc = await openFixture("src/UseValue.java");
    const text = doc.getText();
    const offset = text.indexOf("retry");
    const pos = doc.positionAt(offset);
    const defs = (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      doc.uri,
      pos
    )) as vscode.Location[];
    assert.ok(defs && defs.length >= 1);
    assert.ok(defs[0].uri.fsPath.endsWith("application.properties"));
  });
});
```

- [ ] **Step 6: Add `src/test/fixtures/src/UseValue.java`**

```java
package demo;
import org.springframework.beans.factory.annotation.Value;

public class UseValue {
    @Value("${kks.retry-delay}")
    private int delay;
}
```

- [ ] **Step 7: Build and run integration tests**

Run: `npm test`
Expected: downloads VS Code test build on first run, then PASS (2 passing).
If activation timing is flaky, increase the settle timeout in the test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add integration harness, fixtures, and provider tests"
```

---

## Task 14: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

Include: feature list, settings table, build/run/test commands, SqlDriver
extension-point note, and "no custom UI" design statement. (Author concrete
content from the spec; no placeholders.)

- [ ] **Step 2: Full verification sweep**

Run each and confirm:
- `npm run lint` → no errors
- `npm run test:unit` → all unit suites pass
- `npm run compile` → `dist/extension.js` built
- `npm test` → integration tests pass
- `npm run vsce:package` (install `@vscode/vsce` if needed: `npm i -D @vscode/vsce`) → `.vsix` produced

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README and finalize build/test verification"
```

---

## Self-Review Notes

- **Spec coverage:** PreAuthorize nav (T6), @Value nav (T8), Liquibase highlighting (T9 grammar), SQL execution (T10), settings/gating (T2, T12), incremental indexing (T5/T7/T11/T12), no custom UI (OutputChannel + command + CodeLens only). All covered.
- **Type consistency:** `BeanInfo`, `MethodInfo`, `PropertyLocation`, `TargetLocation`, `SqlConnection`, `SqlDriver`, `SqlExecResult` defined once and reused consistently.
- **Known simplifications (acceptable for MVP):** Java/property parsing is regex/line-based rather than full AST; `T(...)` type navigation uses a workspace type cache built at activation. Documented as future deep-parse extension points.
- **Placeholder scan:** README Step 1 is descriptive but bounded; all code steps contain complete code.
