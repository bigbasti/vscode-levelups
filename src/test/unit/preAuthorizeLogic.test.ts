import * as assert from "assert";
import { BeanIndex } from "../../spring-security/beanIndex";
import { resolveSpelTarget } from "../../spring-security/preAuthorizeDefinitionProvider";

const SERVICE = `@org.springframework.stereotype.Service
public class SvcService {
  public boolean userHasGroup(String g) { return true; }
}
`;

describe("resolveSpelTarget", () => {
  const idx = new BeanIndex();
  idx.updateFromSource("/p/SvcService.java", SERVICE);
  const resolveType = (_n: string) => undefined;

  it("resolves method token to method location", () => {
    const target = resolveSpelTarget(
      "@svcService.userHasGroup(#g)",
      "userHasGroup".length + "@svcService.".length - 1,
      idx,
      resolveType
    );
    assert.ok(target);
    assert.strictEqual(target!.filePath, "/p/SvcService.java");
    assert.strictEqual(target!.line, 2);
  });

  it("resolves bean token to class location", () => {
    const target = resolveSpelTarget("@svcService", 3, idx, resolveType);
    assert.ok(target);
    assert.strictEqual(target!.line, 1);
  });

  it("returns undefined for unknown bean", () => {
    const target = resolveSpelTarget("@nope.x()", 2, idx, resolveType);
    assert.strictEqual(target, undefined);
  });
});
