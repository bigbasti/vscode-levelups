import * as assert from "assert";
import { isLiquibaseChangelog } from "../../liquibase/liquibaseDetector";
import { findEnclosingSqlBlock } from "../../liquibase/sqlInjection";

const CHANGELOG = `<?xml version="1.0"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="1" author="x">
    <sql>
      INSERT INTO t(a) VALUES (1);
    </sql>
  </changeSet>
</databaseChangeLog>
`;

describe("isLiquibaseChangelog", () => {
  it("detects databaseChangeLog root", () => {
    assert.strictEqual(isLiquibaseChangelog(CHANGELOG), true);
  });
  it("rejects plain xml", () => {
    assert.strictEqual(isLiquibaseChangelog("<root><a/></root>"), false);
  });
});

describe("findEnclosingSqlBlock", () => {
  it("returns inner SQL when offset is inside a <sql> block", () => {
    const offset = CHANGELOG.indexOf("INSERT");
    const block = findEnclosingSqlBlock(CHANGELOG, offset);
    assert.ok(block);
    assert.ok(block!.sql.includes("INSERT INTO t(a) VALUES (1);"));
  });
  it("returns the block when offset is on the opening <sql> tag", () => {
    // The CodeLens passes the position of the '<' of '<sql>'.
    const offset = CHANGELOG.indexOf("<sql>");
    const block = findEnclosingSqlBlock(CHANGELOG, offset);
    assert.ok(block);
    assert.ok(block!.sql.includes("INSERT INTO t(a) VALUES (1);"));
  });
  it("returns the block when offset is on the closing </sql> tag", () => {
    const offset = CHANGELOG.indexOf("</sql>");
    const block = findEnclosingSqlBlock(CHANGELOG, offset);
    assert.ok(block);
    assert.ok(block!.sql.includes("INSERT INTO t(a) VALUES (1);"));
  });
  it("returns undefined when offset is outside any <sql>", () => {
    const offset = CHANGELOG.indexOf("changeSet");
    assert.strictEqual(findEnclosingSqlBlock(CHANGELOG, offset), undefined);
  });
});
