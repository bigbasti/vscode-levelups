import * as assert from "assert";
import { BeanIndex } from "../../spring-security/beanIndex";

const SERVICE = `@org.springframework.stereotype.Service
public class FooService {
  public void bar() {}
}
`;
const BEAN_FACTORY = `@Configuration
public class Cfg {
  @Bean
  public UserService userService() { return null; }
}
`;

describe("BeanIndex", () => {
  it("indexes stereotype beans and methods", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/FooService.java", SERVICE);
    const bean = idx.get("fooService");
    assert.ok(bean);
    assert.strictEqual(bean!.className, "FooService");
    assert.ok(bean!.methods.find((m) => m.name === "bar"));
  });

  it("indexes @Bean factory methods by method name", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/Cfg.java", BEAN_FACTORY);
    assert.ok(idx.get("userService"));
  });

  it("removes entries for a deleted file", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/FooService.java", SERVICE);
    idx.removeFile("/p/FooService.java");
    assert.strictEqual(idx.get("fooService"), undefined);
  });
});
