import * as assert from "assert";
import { extractJobParameterKeyAt } from "../../spring-beans/jobParameterDefinitionProvider";

describe("extractJobParameterKeyAt", () => {
  it("extracts a single-quoted jobParameters key", () => {
    const text = `@Value("#{jobParameters['MQ_MESSAGE_INCOMING.ID']}") String id`;
    const offset = text.indexOf("MQ_MESSAGE_INCOMING") + 2;
    const ref = extractJobParameterKeyAt(text, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.key, "MQ_MESSAGE_INCOMING.ID");
  });

  it("extracts a simple key like chunk", () => {
    const text = `@Value("#{jobParameters['chunk']}") String chunkSize`;
    const offset = text.indexOf("chunk'") + 1;
    const ref = extractJobParameterKeyAt(text, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.key, "chunk");
  });

  it("supports double-quoted keys", () => {
    const text = `@Value("#{jobParameters[\\"runDate\\"]}")`;
    const offset = text.indexOf("runDate") + 2;
    const ref = extractJobParameterKeyAt(text, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.key, "runDate");
  });

  it("reports the value range covering the whole dotted key", () => {
    const text = `#{jobParameters['MQ_MESSAGE_INCOMING.ID']}`;
    const offset = text.indexOf("INCOMING");
    const ref = extractJobParameterKeyAt(text, offset)!;
    assert.strictEqual(text.slice(ref.start, ref.end), "MQ_MESSAGE_INCOMING.ID");
  });

  it("returns undefined when the cursor is outside a jobParameters access", () => {
    const text = `@Value("\${some.property}") String x`;
    const offset = text.indexOf("some");
    assert.strictEqual(extractJobParameterKeyAt(text, offset), undefined);
  });
});
