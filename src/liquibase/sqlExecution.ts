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
 * stays out of this function.
 */
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
  // vscode is only available in the extension host, so it is required lazily
  // here to keep this module loadable in plain Node unit tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vs: typeof import("vscode") = require("vscode");
  const choice = await vs.window.showQuickPick(
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

export async function executeSqlCommand(deps: ExecuteSqlDeps): Promise<void> {
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
  const offset = editor.document.offsetAt(editor.selection.active);
  const block = findEnclosingSqlBlock(text, offset);
  if (!block) {
    vs.window.showWarningMessage("Cursor is not inside a <sql> block.");
    return;
  }

  const conn = await pickConnection(
    deps.getConnections(),
    deps.prompt ?? defaultPrompt
  );
  if (!conn) {
    vs.window.showWarningMessage(
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
