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
