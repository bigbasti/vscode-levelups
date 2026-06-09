import { SqlConnection } from "../settings/settings";
import { findEnclosingSqlBlock } from "./sqlInjection";

export interface SqlExecResult {
  affectedRows?: number;
  message?: string;
  error?: string;
}

export interface SqlDriver {
  execute(sql: string, conn: SqlConnection): Promise<SqlExecResult>;
}

/**
 * Stand-in driver that simulates execution without talking to a database. It
 * has no vscode dependency so it can be exercised in plain Node unit tests.
 */
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

/**
 * Decide which connection to use. Pure logic with no vscode dependency: the
 * prompt callback is injected so the prompting strategy (and its vscode usage)
 * stays out of this function. The user always selects from the configured
 * connections so the active target is explicit.
 */
export async function pickConnection(
  conns: SqlConnection[],
  prompt: ConnectionPicker
): Promise<SqlConnection | undefined> {
  if (conns.length === 0) return undefined;
  return prompt(conns);
}

async function defaultPrompt(
  conns: SqlConnection[]
): Promise<SqlConnection | undefined> {
  // vscode is only available in the extension host, so it is required lazily
  // here to keep this module loadable in plain Node unit tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vs: typeof import("vscode") = require("vscode");
  const items = conns.map((c) => ({
    label: c.name,
    description: c.jdbcUrl,
    connection: c,
  }));
  const choice = await vs.window.showQuickPick(items, {
    placeHolder: "Select a SQL connection to execute against",
    matchOnDescription: true,
  });
  return choice?.connection;
}

export interface ExecuteSqlDeps {
  driver: SqlDriver;
  getConnections: () => SqlConnection[];
  prompt?: ConnectionPicker;
}

export async function executeSqlCommand(
  deps: ExecuteSqlDeps,
  at?: { line: number; character: number }
): Promise<void> {
  // vscode and the logger (which itself imports vscode) are required lazily so
  // that the rest of this module loads in unit tests where vscode is absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vs: typeof import("vscode") = require("vscode");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { logError, logInfo, getLogger } = require("../shared/logger");

  const editor = vs.window.activeTextEditor;
  if (!editor) {
    vs.window.showWarningMessage("No active editor.");
    return;
  }
  const text = editor.document.getText();
  // When invoked from a CodeLens, `at` carries the clicked block's start
  // position; clicking a lens does not move the cursor, so prefer it. Fall back
  // to the cursor position when the command is run from the palette.
  const position = at ? new vs.Position(at.line, at.character) : editor.selection.active;
  const offset = editor.document.offsetAt(position);
  const block = findEnclosingSqlBlock(text, offset);
  if (!block) {
    vs.window.showWarningMessage("Cursor is not inside a <sql> block.");
    return;
  }

  const connections = deps.getConnections();
  if (connections.length === 0) {
    const action = await vs.window.showWarningMessage(
      "No SQL connection configured. Add one under vscodeLevelups.sql.connections.",
      "Open Settings"
    );
    if (action === "Open Settings") {
      await vs.commands.executeCommand(
        "workbench.action.openSettings",
        "vscodeLevelups.sql.connections"
      );
    }
    return;
  }

  const conn = await pickConnection(connections, deps.prompt ?? defaultPrompt);
  if (!conn) {
    // User dismissed the picker; nothing to do.
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
