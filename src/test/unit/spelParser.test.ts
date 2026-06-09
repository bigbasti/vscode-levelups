import * as assert from "assert";
import { parseSpel, SpelTokenKind } from "../../spring-security/spelParser";

describe("parseSpel", () => {
  it("parses bean and method call", () => {
    const tokens = parseSpel("@lptUserDetailService.userHasGroup(#id)");
    const bean = tokens.find((t) => t.kind === SpelTokenKind.Bean);
    const method = tokens.find((t) => t.kind === SpelTokenKind.Method);
    assert.ok(bean);
    assert.strictEqual(bean!.beanName, "lptUserDetailService");
    assert.ok(method);
    assert.strictEqual(method!.beanName, "lptUserDetailService");
    assert.strictEqual(method!.methodName, "userHasGroup");
  });

  it("parses bare bean reference", () => {
    const tokens = parseSpel("@lptUserDetailService");
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, SpelTokenKind.Bean);
    assert.strictEqual(tokens[0].beanName, "lptUserDetailService");
  });

  it("parses two method calls joined by or", () => {
    const tokens = parseSpel(
      "@svc.userHasGroup(#g) or @svc.isUserEqualToLoggedInUser(#id)"
    );
    const methods = tokens.filter((t) => t.kind === SpelTokenKind.Method);
    assert.strictEqual(methods.length, 2);
    assert.strictEqual(methods[0].methodName, "userHasGroup");
    assert.strictEqual(methods[1].methodName, "isUserEqualToLoggedInUser");
  });

  it("parses T(package.Class) type reference", () => {
    const tokens = parseSpel("T(de.telekom.lpt.model.UserGroup)");
    const type = tokens.find((t) => t.kind === SpelTokenKind.Type);
    assert.ok(type);
    assert.strictEqual(type!.fqcn, "de.telekom.lpt.model.UserGroup");
    assert.strictEqual(type!.simpleName, "UserGroup");
  });

  it("reports correct offsets within the expression", () => {
    const expr = "@svc.doThing(#id)";
    const tokens = parseSpel(expr);
    const method = tokens.find((t) => t.kind === SpelTokenKind.Method)!;
    assert.strictEqual(expr.slice(method.start, method.end), "doThing");
  });
});
