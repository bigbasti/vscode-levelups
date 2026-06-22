<p align="center">
  <img src="media/levelups.png" alt="VSCode Levelups" width="128" height="128" />
</p>

<h1 align="center">VSCode Levelups</h1>

<p align="center">
  Missing navigation, language intelligence, and Liquibase tooling for Java Spring Boot projects.
</p>

A VS Code extension that adds missing navigation, language intelligence, and
Liquibase tooling for Java Spring Boot projects.

The extension runs entirely in the background. It contributes **no custom views,
sidebars, webviews, or status bar items**. The only surfaces it uses are
standard VS Code "Go to Definition", a single command, an optional CodeLens, and
an output channel. Everything is controlled through `settings.json`, and every
feature is enabled by default.

## At a glance

- **Navigate** (Ctrl/Cmd-Click → Go to Definition):
  - `@PreAuthorize` SpEL → beans, methods, `T(pkg.Class)` types
  - `@Value("${property}")` → the property declaration
  - `@Qualifier("bean")` → the bean definition
  - `@Value("#{jobParameters['KEY']}")` → where the Spring Batch param is set
  - Liquibase `<include>` / `<includeAll>` / `<sqlFile>` → the referenced file
- **Highlight** (TextMate grammar injection, zero runtime cost):
  - SpEL in `@PreAuthorize` and `${…}` in `@Value`
  - SQL in Liquibase `<sql>` blocks
  - JPQL/SQL in Spring Data `@Query(…)`
- **Run**: execute a Liquibase `<sql>` block against a configured connection.

## Features

### 1. Spring Security `@PreAuthorize` navigation
Ctrl/Cmd-Click inside SpEL expressions to jump to the referenced code:

- `@bean` → the bean's class
- `@bean.method(...)` → the method declaration
- `T(pkg.Class)` → the class/enum declaration

Beans are discovered from `@Service`, `@Component`, `@Repository`,
`@Controller`, `@RestController` (default and explicit names, including
fully-qualified annotations) and from `@Bean` factory methods.

```java
@PreAuthorize("@UserDetailService.userHasGroup(#id) or " +
              "hasRole(T(com.app.model.UserGroup).ADMIN)")
public void update(Long id) { … }
//  Ctrl/Cmd-Click: UserDetailService → the @Service class,
//  userHasGroup → the method, UserGroup → the enum.
```

SpEL expressions inside `@PreAuthorize` (and `@PostAuthorize`/`@PreFilter`/
`@PostFilter`) are syntax-highlighted — beans, method calls, `T(...)` types,
`#parameters`, logical operators and security functions are colored instead of
appearing as plain string text.

### 2. Spring `@Value` property navigation
Ctrl/Cmd-Click a property reference to jump to its declaration:

```java
@Value("${kks.retry-delay}")   // -> kks.retry-delay=1000
@Value("${kks.retry-delay:1000}") // default value is ignored
```

Indexed sources: `application*.properties`, `bootstrap*.properties`, and
`application*/bootstrap*.{yml,yaml}` (nested YAML keys are flattened to dotted
keys). When a key is defined in multiple files, VS Code shows a picker.

`${...}` placeholders inside `@Value` are syntax-highlighted: the placeholder
punctuation, the property key, and the `:default` portion are colored
distinctly.

### 3. `@Qualifier` bean navigation
Ctrl/Cmd-Click the bean name inside `@Qualifier("beanName")` to jump to the bean
definition (a `@Bean` factory method or a `@Service`/`@Component`/etc. class
registered under that name). Reuses the same bean index as `@PreAuthorize`.

```java
@Qualifier("myItemWriter") ItemWriter<Foo> writer
//          ^ Ctrl/Cmd-Click → @Bean ItemWriter<…> myItemWriter()
```

### 4. Spring Batch job-parameter navigation
Ctrl/Cmd-Click a key inside `@Value("#{jobParameters['KEY']}")` to jump to where
the parameter is set via a `JobParametersBuilder` (`.addString`/`.addLong`/
`.addDate`/`.addDouble`/`.addParameter`/`.addJobParameter("KEY", …)`). Dotted
keys are supported; when a key is set in several places, VS Code shows a picker.

```java
// Usage site — Ctrl/Cmd-Click the key:
@Value("#{jobParameters['MQ_MESSAGE_INCOMING.ID']}") String id

// …jumps to the definition site:
new JobParametersBuilder()
    .addString("MQ_MESSAGE_INCOMING.ID", messageId)   // ← navigates here
    .addLong("chunk", 100L)
    .toJobParameters();
```

### 5. Liquibase SQL highlighting
SQL embedded in Liquibase changelog XML is highlighted as SQL instead of plain
XML text, including SQL inside `<rollback>` and `<sql>` tags that carry
attributes. Delivered via a TextMate grammar injection — zero runtime cost.

```xml
<changeSet id="1" author="me">
  <sql dbms="oracle">
    INSERT INTO customer (id, name) VALUES (1, 'ACME');   <!-- highlighted as SQL -->
  </sql>
  <rollback>
    <sql>DELETE FROM customer WHERE id = 1;</sql>
  </rollback>
</changeSet>
```

### 6. Liquibase SQL execution
Place the cursor inside a `<sql>` block and run **Levelups: Execute SQL Block**
(or use the CodeLens above the block). The nearest SQL block is extracted, you
pick a target from a QuickPick listing every profile in
`vscodeLevelups.sql.connections` (shown as name + JDBC URL), and the SQL runs
against the selected connection; results are written to the **VSCode Levelups**
output channel. If no connections are configured, a prompt offers to open the
relevant setting.

> SQL execution ships with a built-in **mock driver** that simulates execution
> and reports affected rows. Real database drivers are intentionally not
> bundled. To execute against a real database, replace the driver via the
> `SqlDriver` extension point in `src/liquibase/sqlExecution.ts`
> (`interface SqlDriver { execute(sql, conn): Promise<SqlExecResult> }`).

### 7. Liquibase file-reference navigation
Ctrl/Cmd-click a path inside a changelog's `<include file="…">`,
`<sqlFile path="…">`, or `<includeAll path="…">` to jump to the referenced file
or directory. Paths are resolved relative to the current changelog when
`relativeToChangelogFile="true"`; otherwise common resource roots
(`src/main/resources`, `src/test/resources`) and the workspace folders are also
tried. Only targets that exist on disk are linked, and the whole path is
underlined as a single link.

```xml
<databaseChangeLog>
  <!-- Ctrl/Cmd-Click the path to open the referenced changelog: -->
  <include file="changelog/db.-main-26.02.00.19.xml" relativeToChangelogFile="true"/>
  <includeAll path="changelog/parts"/>
  <sqlFile path="sql/seed.sql"/>
</databaseChangeLog>
```

### 8. SQL highlighting in `@Query` (Spring Data JPA)
JPQL/SQL inside `@Query("…")` is syntax-highlighted instead of appearing as
plain string text — including `@Query(value = "…", nativeQuery = true)`,
concatenated multi-line strings, and Java text blocks (`"""…"""`). Delivered via
TextMate grammar injection (zero runtime cost), so like the other highlighting
it is always on and has no setting.

```java
// Single-line JPQL — keywords, identifiers and literals are colored:
@Query("SELECT i FROM TmpMqMessageIncoming i WHERE i.messageId = :messageId")
Optional<TmpMqMessageIncoming> findByMessageId(@Param("messageId") String messageId);

// Native SQL:
@Query(value = "SELECT * FROM mq_message_incoming WHERE id = :id", nativeQuery = true)
Optional<TmpMqMessageIncoming> findNative(@Param("id") BigInteger id);

// Multi-line via a Java text block:
@Query("""
        SELECT i FROM TmpMqMessageIncoming i
        WHERE i.status = :status
        ORDER BY i.createdAt DESC
        """)
Page<TmpMqMessageIncoming> findByStatus(@Param("status") String status, Pageable pageable);
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `vscodeLevelups.enablePreAuthorizeNavigation` | `true` | Navigation inside `@PreAuthorize` SpEL expressions. |
| `vscodeLevelups.enableValueNavigation` | `true` | Navigation from `@Value` to property definitions. |
| `vscodeLevelups.enableQualifierNavigation` | `true` | Navigation from `@Qualifier("bean")` to the bean definition. |
| `vscodeLevelups.enableJobParameterNavigation` | `true` | Navigation from `@Value("#{jobParameters['KEY']}")` to where the job parameter is set. |
| `vscodeLevelups.enableLiquibaseSqlExecution` | `true` | Allow executing SQL blocks from Liquibase XML. |
| `vscodeLevelups.enableLiquibaseFileNavigation` | `true` | Navigation from `include`/`includeAll`/`sqlFile` references to the referenced files. |
| `vscodeLevelups.sql.connections` | `[]` | SQL connection profiles (see below). |

Liquibase SQL highlighting is always on. It is delivered through a static
TextMate grammar injection contributed in `package.json`, which has zero runtime
cost and cannot be toggled at runtime, so it has no setting.

Connection profile shape:

```json
{
  "vscodeLevelups.sql.connections": [
    {
      "name": "DEV",
      "jdbcUrl": "jdbc:oracle:thin:@localhost:1521/XEPDB1",
      "username": "app",
      "password": "secret"
    }
  ]
}
```

Each feature can be toggled independently at runtime; flipping a setting
registers or disposes the relevant providers without a window reload.

## Compatibility

Works alongside the Java Extension Pack / Red Hat Java extension. Supports Maven,
Gradle, multi-module, and multi-root workspaces. All providers are additive — VS
Code merges their results with those from other extensions.

## License

[MIT](LICENSE) © Sebastian Gross
