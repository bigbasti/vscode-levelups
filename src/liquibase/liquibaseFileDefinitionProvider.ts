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
  ): vscode.LocationLink[] | undefined {
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

    // Return a LocationLink with an explicit originSelectionRange so the editor
    // underlines the entire path value as one link. Without it, VS Code falls
    // back to the XML word pattern and underlines only the word fragment under
    // the cursor (e.g. "19" in db.lpt-main-26.02.00.19.xml).
    const originSelectionRange = new vs.Range(
      document.positionAt(ref.valueStart),
      document.positionAt(ref.valueEnd)
    );
    const targetUri = vs.Uri.file(target);
    const targetRange = new vs.Range(0, 0, 0, 0);

    return [
      {
        originSelectionRange,
        targetUri,
        targetRange,
      },
    ];
  }
}
