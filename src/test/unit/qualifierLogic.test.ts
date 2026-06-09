import * as assert from "assert";
import { extractQualifierBeanAt } from "../../spring-beans/qualifierDefinitionProvider";

describe("extractQualifierBeanAt", () => {
  it("extracts the bean name when the cursor is inside the qualifier value", () => {
    const text =
      '@Qualifier("tamTkg46NeLiItemWriter") ItemWriter<Foo> writer';
    const offset = text.indexOf("tamTkg46NeLiItemWriter") + 3;
    const ref = extractQualifierBeanAt(text, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.name, "tamTkg46NeLiItemWriter");
  });

  it("reports the value range covering the whole bean name", () => {
    const text = '@Qualifier("myBean")';
    const offset = text.indexOf("myBean") + 1;
    const ref = extractQualifierBeanAt(text, offset)!;
    assert.strictEqual(text.slice(ref.start, ref.end), "myBean");
  });

  it("handles whitespace inside the annotation", () => {
    const text = '@Qualifier(  "spacedBean"  )';
    const offset = text.indexOf("spacedBean") + 2;
    const ref = extractQualifierBeanAt(text, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.name, "spacedBean");
  });

  it("returns undefined when the cursor is outside any qualifier", () => {
    const text = 'private ItemWriter<Foo> writer; // @Qualifier("x")';
    const offset = text.indexOf("writer");
    assert.strictEqual(extractQualifierBeanAt(text, offset), undefined);
  });

  it("returns undefined on the annotation name itself", () => {
    const text = '@Qualifier("myBean")';
    const offset = text.indexOf("Qualifier");
    assert.strictEqual(extractQualifierBeanAt(text, offset), undefined);
  });
});
