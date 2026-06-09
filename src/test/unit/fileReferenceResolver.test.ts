import * as assert from "assert";
import {
  findFileReferenceAtOffset,
  resolveReferencePaths,
} from "../../liquibase/fileReferenceResolver";

const MASTER = `<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
    <include file="changelog/db.lpt-main-00.00.00.02.xml" relativeToChangelogFile="true"/>
    <includeAll path="changelog/parts" relativeToChangelogFile="true"/>
    <sqlFile path="sql/seed.sql"/>
    <include file="classpath/changelog/other.xml"/>
</databaseChangeLog>
`;

describe("findFileReferenceAtOffset", () => {
  it("detects an <include file> reference under the cursor", () => {
    const offset = MASTER.indexOf("db.lpt-main-00.00.00.02.xml");
    const ref = findFileReferenceAtOffset(MASTER, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.tag, "include");
    assert.strictEqual(ref!.attr, "file");
    assert.strictEqual(ref!.value, "changelog/db.lpt-main-00.00.00.02.xml");
    assert.strictEqual(ref!.relativeToChangelogFile, true);
  });

  it("detects an <includeAll path> reference", () => {
    const offset = MASTER.indexOf("changelog/parts");
    const ref = findFileReferenceAtOffset(MASTER, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.tag, "includeAll");
    assert.strictEqual(ref!.attr, "path");
    assert.strictEqual(ref!.value, "changelog/parts");
    assert.strictEqual(ref!.relativeToChangelogFile, true);
  });

  it("detects a <sqlFile path> reference with no relative attribute", () => {
    const offset = MASTER.indexOf("sql/seed.sql");
    const ref = findFileReferenceAtOffset(MASTER, offset);
    assert.ok(ref);
    assert.strictEqual(ref!.tag, "sqlFile");
    assert.strictEqual(ref!.attr, "path");
    assert.strictEqual(ref!.value, "sql/seed.sql");
    assert.strictEqual(ref!.relativeToChangelogFile, false);
  });

  it("exposes the value's character range", () => {
    const offset = MASTER.indexOf("sql/seed.sql");
    const ref = findFileReferenceAtOffset(MASTER, offset)!;
    assert.strictEqual(MASTER.slice(ref.valueStart, ref.valueEnd), "sql/seed.sql");
  });

  it("returns undefined when the cursor is not on a file reference", () => {
    const offset = MASTER.indexOf("databaseChangeLog");
    assert.strictEqual(findFileReferenceAtOffset(MASTER, offset), undefined);
  });

  it("returns undefined when the cursor is on the attribute name, not the value", () => {
    const offset = MASTER.indexOf('file="') + 1; // on "file"
    assert.strictEqual(findFileReferenceAtOffset(MASTER, offset), undefined);
  });
});

describe("resolveReferencePaths", () => {
  const changelogDir = "/proj/src/main/resources/db";
  const resourceRoots = [
    "/proj/src/main/resources",
    "/proj/src/test/resources",
    "/proj",
  ];

  it("resolves a changelog-relative reference against the changelog folder first", () => {
    const candidates = resolveReferencePaths(
      {
        tag: "include",
        attr: "file",
        value: "changelog/a.xml",
        relativeToChangelogFile: true,
        valueStart: 0,
        valueEnd: 0,
      },
      changelogDir,
      resourceRoots
    );
    assert.strictEqual(candidates[0], "/proj/src/main/resources/db/changelog/a.xml");
  });

  it("includes resource-root candidates when not changelog-relative", () => {
    const candidates = resolveReferencePaths(
      {
        tag: "include",
        attr: "file",
        value: "changelog/a.xml",
        relativeToChangelogFile: false,
        valueStart: 0,
        valueEnd: 0,
      },
      changelogDir,
      resourceRoots
    );
    // changelog-relative is still tried first as a practical fallback
    assert.strictEqual(candidates[0], "/proj/src/main/resources/db/changelog/a.xml");
    assert.ok(candidates.includes("/proj/src/main/resources/changelog/a.xml"));
    assert.ok(candidates.includes("/proj/src/test/resources/changelog/a.xml"));
    assert.ok(candidates.includes("/proj/changelog/a.xml"));
  });

  it("does not add resource-root candidates when changelog-relative", () => {
    const candidates = resolveReferencePaths(
      {
        tag: "include",
        attr: "file",
        value: "a.xml",
        relativeToChangelogFile: true,
        valueStart: 0,
        valueEnd: 0,
      },
      changelogDir,
      resourceRoots
    );
    assert.deepStrictEqual(candidates, ["/proj/src/main/resources/db/a.xml"]);
  });

  it("returns de-duplicated candidates", () => {
    const candidates = resolveReferencePaths(
      {
        tag: "include",
        attr: "file",
        value: "a.xml",
        relativeToChangelogFile: false,
        valueStart: 0,
        valueEnd: 0,
      },
      "/proj",
      ["/proj"]
    );
    const unique = new Set(candidates);
    assert.strictEqual(unique.size, candidates.length);
  });
});
