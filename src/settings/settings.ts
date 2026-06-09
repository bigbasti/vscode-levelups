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
  get enableLiquibaseSqlExecution(): boolean {
    return this.cfg().get(SECTION_KEYS.exec, true);
  }
  get sqlConnections(): SqlConnection[] {
    return this.cfg().get<SqlConnection[]>(SECTION_KEYS.conns, []);
  }
}

export function vscodeSettings(): Settings {
  // Lazy require so unit tests need not load vscode.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require("vscode");
  return new Settings(() => vscode.workspace.getConfiguration("vscodeLevelups"));
}
