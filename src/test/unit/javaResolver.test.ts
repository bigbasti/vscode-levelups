import * as assert from "assert";
import {
  detectBeansInSource,
  defaultBeanName,
} from "../../java/javaClassResolver";
import { findMethodLocation } from "../../java/javaMethodResolver";

const SERVICE = `package de.telekom.lpt;

import org.springframework.stereotype.Service;

@Service
public class LptUserDetailService {
    public boolean userHasGroup(String g) {
        return true;
    }
    public boolean isUserEqualToLoggedInUser(Long id) {
        return false;
    }
}
`;

const NAMED = `@Component("customName")
public class SomeThing {}
`;

describe("defaultBeanName", () => {
  it("lowercases first char", () => {
    assert.strictEqual(defaultBeanName("LptUserDetailService"), "lptUserDetailService");
    assert.strictEqual(defaultBeanName("URLService"), "uRLService");
  });
});

describe("detectBeansInSource", () => {
  it("finds default-named service bean", () => {
    const beans = detectBeansInSource(SERVICE, "/x/LptUserDetailService.java");
    assert.strictEqual(beans.length, 1);
    assert.strictEqual(beans[0].beanName, "lptUserDetailService");
    assert.strictEqual(beans[0].className, "LptUserDetailService");
    assert.strictEqual(beans[0].methods.length, 2);
  });

  it("uses explicit bean name when provided", () => {
    const beans = detectBeansInSource(NAMED, "/x/SomeThing.java");
    assert.strictEqual(beans[0].beanName, "customName");
  });
});

describe("findMethodLocation", () => {
  it("returns line of method declaration", () => {
    const beans = detectBeansInSource(SERVICE, "/x/LptUserDetailService.java");
    const loc = findMethodLocation(beans[0], "isUserEqualToLoggedInUser");
    assert.ok(loc);
    assert.strictEqual(loc!.line, 9); // 0-based line index
  });
});
