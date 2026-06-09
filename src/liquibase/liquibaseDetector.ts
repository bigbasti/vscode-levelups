export function isLiquibaseChangelog(xml: string): boolean {
  if (/<databaseChangeLog\b/.test(xml)) return true;
  if (/liquibase\.org\/xml\/ns\/dbchangelog/.test(xml)) return true;
  return false;
}
