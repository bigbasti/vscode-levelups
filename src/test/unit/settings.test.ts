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
