import { bulkInsertValues } from '../SQLiteBulkInsert';

describe('bulkInsertValues', () => {
  const createMockDb = () => {
    const calls: { sql: string; params: any[] }[] = [];
    return {
      calls,
      db: {
        runAsync: jest.fn(async (sql: string, params: any[]) => {
          calls.push({ sql, params });
        }),
      },
    };
  };

  it('空配列では何もしない', async () => {
    const { db } = createMockDb();
    await bulkInsertValues(db, '_layer_field', []);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('複数行VALUESでまとめて挿入する', async () => {
    const { db, calls } = createMockDb();
    await bulkInsertValues(db, '_layer_field', ['アカマツ', 'クロマツ', 'スギ']);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe('INSERT INTO "_layer_field" (value) VALUES (?),(?),(?)');
    expect(calls[0].params).toEqual(['アカマツ', 'クロマツ', 'スギ']);
  });

  it('値をtrimして挿入する', async () => {
    const { db, calls } = createMockDb();
    await bulkInsertValues(db, '_layer_field', [' アカマツ ', 'スギ\n']);
    expect(calls[0].params).toEqual(['アカマツ', 'スギ']);
  });

  it('500件ごとに分割して挿入する', async () => {
    const { db, calls } = createMockDb();
    const values = Array.from({ length: 1200 }, (_, i) => `種${i}`);
    await bulkInsertValues(db, '_layer_field', values);
    expect(calls).toHaveLength(3);
    expect(calls[0].params).toHaveLength(500);
    expect(calls[1].params).toHaveLength(500);
    expect(calls[2].params).toHaveLength(200);
    // プレースホルダ数とパラメータ数が一致する
    expect(calls[0].sql.match(/\(\?\)/g)).toHaveLength(500);
    expect(calls[2].sql.match(/\(\?\)/g)).toHaveLength(200);
    // 全件が順序どおりに挿入される
    expect([...calls[0].params, ...calls[1].params, ...calls[2].params]).toEqual(values);
  });
});
