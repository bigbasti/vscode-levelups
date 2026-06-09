import type * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { isLiquibaseChangelog } from "./liquibaseDetector";
import {
  findFileReferenceAtOffset,
  resolveReferencePaths,
} from "./fileReferenceResolver";

export type ResourceRootsProvider = () => string[];
export type PathExists = (p: string) => boolean;

/**
 * Navigates from <include file>, <includeAll path> and <sqlFile path>
 * references in a Liquibase changelog to the referenced file or directory.
 */
export class LiquibaseFileDefinitionProvider
  implements vscode.DefinitionProvider
{
  constructor(
    private readonly getResourceRoots: ResourceRootsProvider,
    private readonly exists: PathExists = fs.existsSync
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    // vscode is only available in the extension host, so it is required lazily
    // to keep this module loadable in plain Node unit tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");

    const text = document.getText();
    if (!isLiquibaseChangelog(text)) return undefined;

    const offset = document.offsetAt(position);
    const ref = findFileReferenceAtOffset(text, offset);
    if (!ref) return undefined;

    const changelogDir = path.dirname(document.uri.fsPath);
    const candidates = resolveReferencePaths(
      ref,
      changelogDir,
      this.getResourceRoots()
    );

    const target = candidates.find((p) => this.exists(p));
    if (!target) return undefined;

    return new vs.Location(vs.Uri.file(target), new vs.Position(0, 0));
  }
}
