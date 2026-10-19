// Whether a migration is one the old code survives (ADR 0019). While a
// production build runs, the old version keeps serving against the database that
// was already migrated, so a migration may add but must never remove or tighten.
// Removing something takes two steps: stop using it in one change, drop it in a
// later one. Pure: it only reads the SQL it is given.

// A risky migration is accepted when it carries this comment on a line of its
// own, with a reason after the colon.
const ALLOW_MARKER = /^[ \t]*--[ \t]*allow-destructive:[ \t]*\S/m

const RISKY: RegExp[] = [
  // Gone for the old code.
  /\bDROP (COLUMN|TABLE|SCHEMA|TYPE)\b/i,
  /\bRENAME\b/i,
  // Old code writes rows that would now be refused.
  /\bSET NOT NULL\b/i,
  /\bALTER COLUMN \S+ (SET DATA )?TYPE\b/i,
  // A required column the old code knows nothing about: its inserts fail.
  /\bADD COLUMN\b(?!.*\bDEFAULT\b).*\bNOT NULL\b/i,
  // Data that cannot be brought back.
  /^TRUNCATE\b/i,
  /^DELETE FROM\b/i,
]

// The statements of a migration that are risky, as one line each. Empty when the
// migration is safe, or says why it is not (the marker). Comments are not read:
// a word in a comment is not a statement.
export function findRiskyStatements(sql: string): string[] {
  if (ALLOW_MARKER.test(sql)) return []

  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement !== '')
    .filter((statement) => RISKY.some((pattern) => pattern.test(statement)))
}
