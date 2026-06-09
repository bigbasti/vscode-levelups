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
const BEAN_FACTORY_NAMED = `@Configuration
public class Cfg {
  @Bean(name = "userService")
  public UserService userService() { return null; }
}
`;
const BEAN_FACTORY_VALUE = `@Configuration
public class Cfg {
  @Bean(value = "userService", initMethod = "init")
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

  it("indexes @Bean(name=...) by method name, not the annotation token", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/Cfg.java", BEAN_FACTORY_NAMED);
    assert.ok(idx.get("userService"), "real bean method should be indexed");
    assert.strictEqual(
      idx.get("Bean"),
      undefined,
      "annotation token must not be indexed as a bean"
    );
  });

  it("indexes @Bean(value=..., initMethod=...) by method name", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/Cfg.java", BEAN_FACTORY_VALUE);
    assert.ok(idx.get("userService"), "real bean method should be indexed");
    assert.strictEqual(idx.get("Bean"), undefined);
  });

  it("removes entries for a deleted file", () => {
    const idx = new BeanIndex();
    idx.updateFromSource("/p/FooService.java", SERVICE);
    idx.removeFile("/p/FooService.java");
    assert.strictEqual(idx.get("fooService"), undefined);
  });
});
