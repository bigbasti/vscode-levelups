import * as assert from "assert";
import {
  detectJobParameterDefinitions,
  JobParameterIndex,
} from "../../spring-beans/jobParameterIndex";

const BUILDER = `JobParameters params = new JobParametersBuilder()
    .addString("MQ_MESSAGE_INCOMING.ID", messageId)
    .addLong("chunk", 100L)
    .addDate("runDate", new Date())
    .addParameter("custom", new JobParameter("x"))
    .toJobParameters();
`;

describe("detectJobParameterDefinitions", () => {
  it("finds keys from addString/addLong/addDate/addParameter", () => {
    const defs = detectJobParameterDefinitions(BUILDER, "/p/Job.java");
    const keys = defs.map((d) => d.key);
    assert.ok(keys.includes("MQ_MESSAGE_INCOMING.ID"));
    assert.ok(keys.includes("chunk"));
    assert.ok(keys.includes("runDate"));
    assert.ok(keys.includes("custom"));
  });

  it("reports the line and column of the key literal", () => {
    const defs = detectJobParameterDefinitions(BUILDER, "/p/Job.java");
    const id = defs.find((d) => d.key === "MQ_MESSAGE_INCOMING.ID")!;
    assert.strictEqual(id.line, 1); // 0-based: second line
    const lines = BUILDER.split("\n");
    const col = lines[id.line].indexOf("MQ_MESSAGE_INCOMING.ID");
    assert.strictEqual(id.column, col);
  });
});

describe("JobParameterIndex", () => {
  it("indexes keys and returns their locations", () => {
    const idx = new JobParameterIndex();
    idx.updateFromSource("/p/Job.java", BUILDER);
    const locs = idx.get("MQ_MESSAGE_INCOMING.ID");
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(locs[0].filePath, "/p/Job.java");
    assert.strictEqual(locs[0].line, 1);
  });

  it("returns multiple locations across files", () => {
    const idx = new JobParameterIndex();
    idx.updateFromSource("/p/A.java", '.addString("chunk", a)\n');
    idx.updateFromSource("/p/B.java", '.addLong("chunk", b)\n');
    assert.strictEqual(idx.get("chunk").length, 2);
  });

  it("removes entries for a deleted file", () => {
    const idx = new JobParameterIndex();
    idx.updateFromSource("/p/A.java", '.addString("chunk", a)\n');
    idx.removeFile("/p/A.java");
    assert.strictEqual(idx.get("chunk").length, 0);
  });

  it("returns an empty array for unknown keys", () => {
    const idx = new JobParameterIndex();
    assert.deepStrictEqual(idx.get("nope"), []);
  });
});
