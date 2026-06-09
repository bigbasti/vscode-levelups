import * as assert from "assert";
import { extractPropertyKeyAt } from "../../spring-properties/valueDefinitionProvider";

describe("extractPropertyKeyAt", () => {
  it("extracts key without default", () => {
    const text = '@Value("${kks.retry-delay}")';
    const offset = text.indexOf("retry");
    assert.strictEqual(extractPropertyKeyAt(text, offset), "kks.retry-delay");
  });

  it("extracts key ignoring default value", () => {
    const text = '@Value("${kks.retry-delay:1000}")';
    const offset = text.indexOf("retry");
    assert.strictEqual(extractPropertyKeyAt(text, offset), "kks.retry-delay");
  });

  it("returns undefined outside any placeholder", () => {
    const text = 'String x = "plain";';
    assert.strictEqual(extractPropertyKeyAt(text, 5), undefined);
  });
});
