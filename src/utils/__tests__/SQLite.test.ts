import { isValidTableName } from '../SQLite';

describe('isValidTableName', () => {
  it('accepts dictionary table names', () => {
    // 実際の形式: _${layerId}_${fieldId}（ULID）
    expect(isValidTableName('_01HQ8Z9K2M3N4P5Q6R7S8T9V0W_01HQ8Z9K2M3N4P5Q6R7S8T9V0X')).toBe(true);
    expect(isValidTableName('table1')).toBe(true);
    expect(isValidTableName('my-table_2')).toBe(true);
  });

  it('rejects names that could break out of the quoted identifier', () => {
    expect(isValidTableName('foo" (value TEXT); DROP TABLE users; --')).toBe(false);
    expect(isValidTableName('foo"bar')).toBe(false);
    expect(isValidTableName("foo'bar")).toBe(false);
    expect(isValidTableName('foo bar')).toBe(false);
    expect(isValidTableName('foo;bar')).toBe(false);
    expect(isValidTableName('foo`bar')).toBe(false);
    expect(isValidTableName('foo]bar')).toBe(false);
  });

  it('rejects SQLite reserved names', () => {
    expect(isValidTableName('sqlite_sequence')).toBe(false);
    expect(isValidTableName('SQLITE_stat1')).toBe(false);
  });

  it('rejects empty, oversized, and non-string values', () => {
    expect(isValidTableName('')).toBe(false);
    expect(isValidTableName('a'.repeat(129))).toBe(false);
    expect(isValidTableName(undefined)).toBe(false);
    expect(isValidTableName(null)).toBe(false);
    expect(isValidTableName(123)).toBe(false);
  });
});
