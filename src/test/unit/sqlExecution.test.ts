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
  it("prompts even when only one connection exists", async () => {
    const conn = { name: "DEV", jdbcUrl: "j", username: "u", password: "p" };
    let prompted = false;
    const chosen = await pickConnection([conn], async (conns) => {
      prompted = true;
      return conns[0];
    });
    assert.strictEqual(prompted, true);
    assert.strictEqual(chosen, conn);
  });

  it("prompts when multiple connections exist", async () => {
    const a = { name: "A", jdbcUrl: "j", username: "u", password: "p" };
    const b = { name: "B", jdbcUrl: "j", username: "u", password: "p" };
    const chosen = await pickConnection([a, b], async (conns) => conns[1]);
    assert.strictEqual(chosen, b);
  });

  it("returns undefined when the user dismisses the picker", async () => {
    const conn = { name: "DEV", jdbcUrl: "j", username: "u", password: "p" };
    const chosen = await pickConnection([conn], async () => undefined);
    assert.strictEqual(chosen, undefined);
  });

  it("returns undefined without prompting when no connections", async () => {
    let prompted = false;
    const chosen = await pickConnection([], async () => {
      prompted = true;
      return undefined;
    });
    assert.strictEqual(prompted, false);
    assert.strictEqual(chosen, undefined);
  });
});
