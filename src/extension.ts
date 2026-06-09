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
import { MockSqlDriver, executeSqlCommand } from "./liquibase/sqlExecution";
import { LiquibaseCodeLensProvider } from "./liquibase/liquibaseCodeLens";

const JAVA_SELECTOR: vscode.DocumentSelector = { language: "java" };
const XML_SELECTOR: vscode.DocumentSelector = { language: "xml" };
const PROPERTY_GLOB = "**/{application,bootstrap}*.{properties,yml,yaml}";

let featureDisposables: vscode.Disposable[] = [];
const typeCache = new Map<string, TargetLocation>();

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const settings = vscodeSettings();
  const beanIndex = new BeanIndex();
  const propertyIndex = new PropertyIndex();

  logInfo("vscode-levelups activating");

  await buildBeanIndex(beanIndex);
  await buildPropertyIndex(propertyIndex);

  context.subscriptions.push(
    createWatcher("**/*.java", {
      onChange: async (uri) => {
        const src = await readFile(uri);
        beanIndex.updateFromSource(uri.fsPath, src);
        cacheTypesFromSource(uri.fsPath, src);
      },
      onDelete: (uri) => beanIndex.removeFile(uri.fsPath),
    }),
    createWatcher(PROPERTY_GLOB, {
      onChange: async (uri) =>
        propertyIndex.updateFromSource(uri.fsPath, await readFile(uri)),
      onDelete: (uri) => propertyIndex.removeFile(uri.fsPath),
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscodeLevelups.executeSql",
      async (at?: vscode.Position) => {
        const s = vscodeSettings();
        if (!s.enableLiquibaseSqlExecution) {
          vscode.window.showInformationMessage(
            "Liquibase SQL execution is disabled in settings."
          );
          return;
        }
        await executeSqlCommand(
          {
            driver: new MockSqlDriver(),
            getConnections: () => s.sqlConnections,
          },
          at ? { line: at.line, character: at.character } : undefined
        );
      }
    )
  );

  registerFeatures(settings, beanIndex, propertyIndex);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vscodeLevelups")) {
        registerFeatures(settings, beanIndex, propertyIndex);
      }
    })
  );
}

function registerFeatures(
  settings: Settings,
  beanIndex: BeanIndex,
  propertyIndex: PropertyIndex
): void {
  for (const d of featureDisposables) d.dispose();
  featureDisposables = [];

  if (settings.enablePreAuthorizeNavigation) {
    const resolveType = (simpleName: string): TargetLocation | undefined =>
      typeCache.get(simpleName);
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
  // Note: featureDisposables are intentionally NOT pushed onto
  // context.subscriptions. registerFeatures runs on every config change and
  // manages this generation's disposables directly (disposing the previous set
  // above); deactivate() disposes the final set. Pushing here would append a
  // new, already-disposed generation to context.subscriptions on every config
  // change, leaking them for the host lifetime.
}

async function buildBeanIndex(beanIndex: BeanIndex): Promise<void> {
  const files = await findJavaFiles();
  for (const uri of files) {
    const src = await readFile(uri);
    beanIndex.updateFromSource(uri.fsPath, src);
    cacheTypesFromSource(uri.fsPath, src);
  }
}

function cacheTypesFromSource(filePath: string, src: string): void {
  const decl = /\b(?:class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src)) !== null) {
    const name = m[1];
    const loc = findTypeInSource(src, filePath, name);
    if (loc) typeCache.set(name, loc);
  }
}

async function buildPropertyIndex(propertyIndex: PropertyIndex): Promise<void> {
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
