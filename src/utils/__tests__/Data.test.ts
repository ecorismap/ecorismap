import { LatLonDMSType, LayerType, LocationType, RecordType } from '../../types';
import {
  boundingBoxFromRecords,
  filterRecords,
  getFilterCandidates,
  narrowFilterCandidates,
  sortData,
  getInitialFieldValue,
  mergeLayerData,
  updateRecordCoords,
  isLatLonEmpty,
  resolveAddLocation,
} from '../Data';

describe('sortData', () => {
  const recordExt: RecordType[] = [
    {
      id: '0',
      userId: '0',
      displayName: 'mizutani',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 1, name: 'みやぎ' },
    },
    {
      id: '1',
      userId: '0',
      displayName: 'mizutani',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 2, name: 'あいち' },
    },
  ];

  it('return DESCENDING recordSet sorted by no', () => {
    expect(sortData(recordExt, 'no', 'DESCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
  it('return ASCENDING recordSet sorted by name', () => {
    expect(sortData(recordExt, 'name', 'ASCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
  it('return UNSORTED recordSet', () => {
    expect(sortData(recordExt, 'name')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
});

describe('sortData with _user_ column', () => {
  const recordExt: RecordType[] = [
    {
      id: '0',
      userId: '0',
      displayName: 'mizutani',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 1, name: 'みやぎ' },
    },
    {
      id: '1',
      userId: '1',
      displayName: 'sato',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 2, name: 'あいち' },
    },
  ];

  it('return ASCENDING recordSet sorted by _user_', () => {
    expect(sortData(recordExt, '_user_', 'ASCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'sato',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '1',
          visible: true,
        },
      ],
      idx: [0, 1],
    });
  });

  it('return DESCENDING recordSet sorted by _user_', () => {
    expect(sortData(recordExt, '_user_', 'DESCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'sato',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '1',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
});

describe('getInitialFieldValue', () => {
  it('return default value', () => {
    expect(getInitialFieldValue('STRING')).toStrictEqual('');
    expect(getInitialFieldValue('SERIAL')).toStrictEqual(0);
    expect(getInitialFieldValue('INTEGER')).toStrictEqual(0);
    expect(getInitialFieldValue('DECIMAL')).toStrictEqual(0);
    expect(getInitialFieldValue('DATETIME')).toStrictEqual('');
    expect(getInitialFieldValue('PHOTO')).toStrictEqual([]);
    expect(
      getInitialFieldValue('CHECK', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('');
    expect(
      getInitialFieldValue('RADIO', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('a');
    expect(
      getInitialFieldValue('LIST', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('a');
    expect(getInitialFieldValue('CHECK')).toStrictEqual('');
    expect(getInitialFieldValue('RADIO', [])).toStrictEqual('');
    expect(getInitialFieldValue('LIST')).toStrictEqual('');
  });
});

describe('mergeLayerData', () => {
  const ownUserId = 'user1';
  const otherUserId = 'user2';
  const layerId = 'layer1';

  const recordOwn: RecordType = { id: 'a', userId: ownUserId, field: { value: 'own' }, coords: null } as any;
  const recordOther: RecordType = { id: 'a', userId: otherUserId, field: { value: 'other' }, coords: null } as any;
  const recordOwn2: RecordType = { id: 'b', userId: ownUserId, field: { value: 'own2' }, coords: null } as any;
  const recordOther2: RecordType = { id: 'b', userId: otherUserId, field: { value: 'other2' }, coords: null } as any;
  const recordTmpl: RecordType = { id: 'c', userId: 'template', field: { value: 'tmpl' }, coords: null } as any;
  const recordOwnLatest: RecordType = {
    id: 'd',
    userId: ownUserId,
    field: { value: 'latest' },
    coords: null,
    updatedAt: 200,
  } as any;
  const recordOtherOld: RecordType = {
    id: 'd',
    userId: otherUserId,
    field: { value: 'old' },
    coords: null,
    updatedAt: 100,
  } as any;

  const ownData = [{ layerId, userId: ownUserId, data: [recordOwn, recordOwn2, recordOwnLatest] }];
  const otherData = [{ layerId, userId: otherUserId, data: [recordOther, recordOther2, recordOtherOld] }];
  const tmplData = { layerId, userId: 'template', data: [recordTmpl] };

  it('自分優先（self）: 自分のデータが優先される', async () => {
    const [merged, tmpl] = await mergeLayerData({
      layerData: [...ownData, ...otherData],
      templateData: tmplData,
      ownUserId,
      strategy: 'self',
    });
    expect(merged[0].data).toEqual(
      expect.arrayContaining([
        recordOwn, // id: 'a' → own
        recordOwn2, // id: 'b' → own2
        recordOwnLatest, // id: 'd' → ownUserIdのlatest
      ])
    );
    expect(tmpl).toBeDefined();
    expect(tmpl!.data).toEqual([recordTmpl]);
  });

  it('他人のみ: 自分のデータがない場合は他人のデータ', async () => {
    const [merged, tmpl] = await mergeLayerData({
      layerData: otherData,
      templateData: tmplData,
      ownUserId,
      strategy: 'self',
    });
    expect(merged[0].data).toEqual(
      expect.arrayContaining([
        recordOther, // id: 'a'
        recordOther2, // id: 'b'
        recordOtherOld, // id: 'd'
      ])
    );
    expect(tmpl!.data).toEqual([recordTmpl]);
  });

  it('テンプレートのみ: データがなければテンプレートのみ返る', async () => {
    const [merged, tmpl] = await mergeLayerData({
      layerData: [],
      templateData: tmplData,
      ownUserId,
      strategy: 'self',
    });
    expect(merged).toEqual([]);
    expect(tmpl!.data).toEqual([recordTmpl]);
  });

  it('最新編集優先（latest）: updatedAtが新しいものを採用', async () => {
    const [merged, tmpl] = await mergeLayerData({
      layerData: [
        { layerId, userId: ownUserId, data: [recordOwnLatest] },
        { layerId, userId: otherUserId, data: [recordOtherOld] },
      ],
      templateData: tmplData,
      ownUserId,
      strategy: 'latest',
    });
    expect(merged[0].data).toEqual([recordOwnLatest]);
    expect(tmpl!.data).toEqual([recordTmpl]);
  });

  it('手動マージ（manual）: conflictsResolverで選択したものを採用', async () => {
    const resolver = jest.fn(async (candidates: any[], _id: string) =>
      candidates.find((r: any) => r.userId === otherUserId)
    );
    const [merged, tmpl] = await mergeLayerData({
      layerData: [...ownData, ...otherData],
      templateData: tmplData,
      ownUserId,
      strategy: 'manual',
      conflictsResolver: resolver,
    });
    // id: 'a','b','d' すべてotherUserIdが選ばれる
    expect(merged[0].data).toEqual(expect.arrayContaining([recordOther, recordOther2, recordOtherOld]));
    expect(resolver).toHaveBeenCalled();
    expect(tmpl!.data).toEqual([recordTmpl]);
  });

  it('テンプレートのみのIDはmergedに含まれない', async () => {
    const [merged, tmpl] = await mergeLayerData({
      layerData: ownData,
      templateData: {
        layerId,
        userId: 'template',
        data: [recordTmpl, { ...recordTmpl, id: 'x', field: { value: 'tmpl2' } }],
      },
      ownUserId,
      strategy: 'self',
    });
    expect(merged[0].data.find((r) => r.id === 'x')).toBeUndefined();
    expect(tmpl!.data.find((r) => r.id === 'x')).toBeDefined();
  });

  it('publicDataが複数ユーザー分存在する場合は全てマージされる', async () => {
    const ownUserId = 'user1';
    const layerId = 'layerX';
    const record1 = { id: 'a', userId: 'user1', field: { value: 'A' }, coords: null } as any;
    const record2 = { id: 'b', userId: 'user2', field: { value: 'B' }, coords: null } as any;
    const publicData = [
      { layerId, userId: 'user1', data: [record1] },
      { layerId, userId: 'user2', data: [record2] },
    ];
    const [merged, tmpl] = await mergeLayerData({
      layerData: publicData,
      templateData: undefined,
      ownUserId,
      strategy: 'self',
    });
    expect(merged.length).toBe(2);
    expect(merged).toEqual(publicData);
    expect(tmpl).toBeUndefined();
  });
});

// 同一アカウント・複数端末でのアップロード時マージ（merge-on-upload）。
// クラウド側(自分)とローカル(自分)を同一userId・strategy:'latest'でマージし、
// conflictsResolverを渡さない（ダイアログを出さずupdatedAt最新優先）動作を検証する。
describe('mergeLayerData（同一userId・merge-on-upload）', () => {
  const userId = 'user1';
  const layerId = 'layer1';

  it('各IDでupdatedAtが新しい方が採用される', async () => {
    // id 'a': クラウドが新しい / id 'b': ローカルが新しい
    const cloud = {
      layerId,
      userId,
      data: [
        { id: 'a', userId, field: { value: 'cloud-a' }, coords: null, updatedAt: 200 } as any,
        { id: 'b', userId, field: { value: 'cloud-b' }, coords: null, updatedAt: 100 } as any,
      ],
    };
    const local = {
      layerId,
      userId,
      data: [
        { id: 'a', userId, field: { value: 'local-a' }, coords: null, updatedAt: 100 } as any,
        { id: 'b', userId, field: { value: 'local-b' }, coords: null, updatedAt: 200 } as any,
      ],
    };
    const [merged] = await mergeLayerData({
      layerData: [cloud, local],
      templateData: undefined,
      ownUserId: userId,
      strategy: 'latest',
    });
    const own = merged.find((d) => d.userId === userId)!;
    expect(own.data.find((r) => r.id === 'a')!.field.value).toBe('cloud-a');
    expect(own.data.find((r) => r.id === 'b')!.field.value).toBe('local-b');
  });

  it('片方のみに存在する追加レコードは消えずに残る（他端末の追加を保持）', async () => {
    // クラウドに端末Aが追加した #cloudOnly、ローカルに端末Bが追加した #localOnly
    const cloud = {
      layerId,
      userId,
      data: [{ id: 'cloudOnly', userId, field: { value: 'A' }, coords: null, updatedAt: 100 } as any],
    };
    const local = {
      layerId,
      userId,
      data: [{ id: 'localOnly', userId, field: { value: 'B' }, coords: null, updatedAt: 100 } as any],
    };
    const [merged] = await mergeLayerData({
      layerData: [cloud, local],
      templateData: undefined,
      ownUserId: userId,
      strategy: 'latest',
    });
    const ids = merged.find((d) => d.userId === userId)!.data.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['cloudOnly', 'localOnly']));
    expect(ids.length).toBe(2);
  });

  it('削除トムストーンはupdatedAtで勝敗判定される（後の操作が勝つ）', async () => {
    // id 'x': ローカルで後から削除 → deleted:true(updatedAt新) がクラウドの編集(updatedAt旧)に勝つ
    // id 'y': クラウドで後から削除 → deleted:true(updatedAt新) がローカルの編集(updatedAt旧)に勝つ
    const cloud = {
      layerId,
      userId,
      data: [
        { id: 'x', userId, field: { value: 'edited' }, coords: null, updatedAt: 100 } as any,
        { id: 'y', userId, field: { value: 'gone' }, coords: null, updatedAt: 200, deleted: true } as any,
      ],
    };
    const local = {
      layerId,
      userId,
      data: [
        { id: 'x', userId, field: { value: 'gone' }, coords: null, updatedAt: 200, deleted: true } as any,
        { id: 'y', userId, field: { value: 'edited' }, coords: null, updatedAt: 100 } as any,
      ],
    };
    const [merged] = await mergeLayerData({
      layerData: [cloud, local],
      templateData: undefined,
      ownUserId: userId,
      strategy: 'latest',
    });
    const own = merged.find((d) => d.userId === userId)!;
    expect(own.data.find((r) => r.id === 'x')!.deleted).toBe(true);
    expect(own.data.find((r) => r.id === 'y')!.deleted).toBe(true);
  });
});

describe('updateRecordCoords', () => {
  const baseRecord: RecordType = {
    id: '0',
    userId: '0',
    displayName: 'mizutani',
    visible: true,
    redraw: false,
    coords: undefined,
    field: { name: 'test' },
  };
  const latlon: LatLonDMSType = {
    latitude: { decimal: '35.5', deg: '35', min: '30', sec: '0' },
    longitude: { decimal: '135.5', deg: '135', min: '30', sec: '0' },
  };
  const emptyLatlon: LatLonDMSType = {
    latitude: { decimal: '', deg: '', min: '', sec: '' },
    longitude: { decimal: '', deg: '', min: '', sec: '' },
  };

  it('位置なしレコードで座標欄が未編集ならcoordsはundefinedのまま', () => {
    const result = updateRecordCoords(baseRecord, emptyLatlon, true, false);
    expect(result.coords).toBeUndefined();
    expect(result).toBe(baseRecord);
  });

  it('位置なしレコードでも座標欄を編集したらcoordsが付与される', () => {
    const result = updateRecordCoords(baseRecord, latlon, true, true);
    expect(result.coords).toEqual({ latitude: 35.5, longitude: 135.5 });
  });

  it('デフォルト（isLatLonDirty省略）は従来通りcoordsを更新する', () => {
    const result = updateRecordCoords(baseRecord, latlon, true);
    expect(result.coords).toEqual({ latitude: 35.5, longitude: 135.5 });
  });

  it('位置ありレコードは未編集フラグでも座標欄の値で更新される（既存挙動維持）', () => {
    const recordWithCoords: RecordType = { ...baseRecord, coords: { latitude: 10, longitude: 20 } };
    const result = updateRecordCoords(recordWithCoords, latlon, true, false);
    expect(result.coords).toEqual({ latitude: 35.5, longitude: 135.5 });
  });

  it('ライン等（coordsが配列）のレコードは変更されない', () => {
    const lineRecord: RecordType = {
      ...baseRecord,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
    };
    const result = updateRecordCoords(lineRecord, latlon, true, true);
    expect(result).toBe(lineRecord);
  });

  it('位置ありレコードの座標欄を空欄にして保存すると位置なしになる', () => {
    const recordWithCoords: RecordType = { ...baseRecord, coords: { latitude: 10, longitude: 20 } };
    const result = updateRecordCoords(recordWithCoords, emptyLatlon, true, true);
    expect(result.coords).toBeUndefined();
  });

  it('位置なしレコードで座標欄が空欄なら位置なしのまま', () => {
    const result = updateRecordCoords(baseRecord, emptyLatlon, true, true);
    expect(result).toBe(baseRecord);
  });
});

describe('isLatLonEmpty', () => {
  const emptyLatlon: LatLonDMSType = {
    latitude: { decimal: '', deg: '', min: '', sec: '' },
    longitude: { decimal: '', deg: '', min: '', sec: '' },
  };

  it('全欄空ならtrue（10進/度分秒とも）', () => {
    expect(isLatLonEmpty(emptyLatlon, true)).toBe(true);
    expect(isLatLonEmpty(emptyLatlon, false)).toBe(true);
  });

  it('10進モードは10進欄のみで判定する', () => {
    const dmsOnly: LatLonDMSType = {
      latitude: { decimal: '', deg: '35', min: '30', sec: '0' },
      longitude: { decimal: '', deg: '135', min: '30', sec: '0' },
    };
    expect(isLatLonEmpty(dmsOnly, true)).toBe(true);
    expect(isLatLonEmpty(dmsOnly, false)).toBe(false);
  });

  it('片方でも入力があればfalse', () => {
    const partial: LatLonDMSType = {
      latitude: { decimal: '35.5', deg: '', min: '', sec: '' },
      longitude: { decimal: '', deg: '', min: '', sec: '' },
    };
    expect(isLatLonEmpty(partial, true)).toBe(false);
  });
});

describe('filterRecords', () => {
  const layer = {
    id: 'layer1',
    name: '植物',
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {},
    label: '種名',
    visible: true,
    active: true,
    field: [
      { id: 'f1', name: '種名', format: 'STRING_DICTIONARY' },
      { id: 'f2', name: '地区', format: 'STRING' },
      { id: 'f3', name: '株数', format: 'INTEGER' },
      { id: 'f4', name: '写真', format: 'PHOTO' },
    ],
  } as unknown as LayerType;

  const records = [
    { id: '1', field: { 種名: 'スギ', 地区: 'A地区', 株数: 3 } },
    { id: '2', field: { 種名: 'ミズナラ', 地区: 'B地区', 株数: 12 } },
    { id: '3', field: { 種名: 'アカマツ', 地区: 'A地区', 株数: 3 } },
  ] as unknown as RecordType[];

  it('空文字なら全件返す', () => {
    expect(filterRecords(records, layer, '', '')).toHaveLength(3);
    expect(filterRecords(records, layer, '   ', '')).toHaveLength(3);
  });

  it('全フィールド横断で部分一致する', () => {
    expect(filterRecords(records, layer, 'スギ', '').map((r) => r.id)).toEqual(['1']);
    expect(filterRecords(records, layer, 'A地区', '').map((r) => r.id)).toEqual(['1', '3']);
    //数値フィールドも文字列として比較する
    expect(filterRecords(records, layer, '12', '').map((r) => r.id)).toEqual(['2']);
  });

  it('フィールドを指定するとその列だけ見る', () => {
    expect(filterRecords(records, layer, 'A地区', '種名')).toHaveLength(0);
    expect(filterRecords(records, layer, 'ナラ', '種名').map((r) => r.id)).toEqual(['2']);
  });

  it('ひらがなで入力してもカタカナの値に一致する', () => {
    expect(filterRecords(records, layer, 'すぎ', '').map((r) => r.id)).toEqual(['1']);
  });

  it('存在しないフィールドを指定した場合は絞り込まない', () => {
    expect(filterRecords(records, layer, 'スギ', '削除済みの列')).toHaveLength(3);
  });

  it('写真フィールドは対象外', () => {
    expect(filterRecords(records, layer, '写真', '写真')).toHaveLength(3);
  });

  describe('User列(_user_)', () => {
    const userRecords = [
      { id: '1', displayName: '山田太郎', field: { 種名: 'スギ' } },
      { id: '2', displayName: 'ヤマダハナコ', field: { 種名: 'ミズナラ' } },
      { id: '3', displayName: null, field: { 種名: 'アカマツ' } },
    ] as unknown as RecordType[];

    it('displayNameで部分一致する', () => {
      expect(filterRecords(userRecords, layer, '山田', '_user_').map((r) => r.id)).toEqual(['1']);
    });

    it('ひらがなで入力してもカタカナの値に一致する', () => {
      expect(filterRecords(userRecords, layer, 'やまだはなこ', '_user_').map((r) => r.id)).toEqual(['2']);
    });

    it('displayNameが無いレコードは一致しない', () => {
      expect(filterRecords(userRecords, layer, 'マツ', '_user_')).toHaveLength(0);
    });
  });
});

describe('getFilterCandidates', () => {
  const layer = {
    id: 'layer1',
    field: [
      { id: 'f1', name: '種名', format: 'STRING' },
      { id: 'f2', name: '株数', format: 'INTEGER' },
      { id: 'f3', name: '写真', format: 'PHOTO' },
    ],
  } as unknown as LayerType;

  const records = [
    { id: '1', displayName: '山田', field: { 種名: 'スギ', 株数: 10 } },
    { id: '2', displayName: '佐藤', field: { 種名: 'アカマツ', 株数: 2 } },
    { id: '3', displayName: '山田', field: { 種名: 'スギ', 株数: 10 } },
    { id: '4', displayName: null, field: { 種名: '', 株数: undefined } },
  ] as unknown as RecordType[];

  it('ユニーク値を昇順で返す（重複と空値は除く）', () => {
    expect(getFilterCandidates(records, layer, '種名')).toEqual(['アカマツ', 'スギ']);
  });

  it('数値フィールドは数値順に並ぶ', () => {
    const numRecords = [
      { id: '1', field: { 株数: 10 } },
      { id: '2', field: { 株数: 2 } },
    ] as unknown as RecordType[];
    expect(getFilterCandidates(numRecords, layer, '株数')).toEqual(['2', '10']);
  });

  it('_user_はdisplayNameから作る', () => {
    expect(getFilterCandidates(records, layer, '_user_')).toEqual(['佐藤', '山田']);
  });

  it('写真フィールドと存在しないフィールドは空を返す', () => {
    expect(getFilterCandidates(records, layer, '写真')).toEqual([]);
    expect(getFilterCandidates(records, layer, '削除済みの列')).toEqual([]);
  });
});

describe('narrowFilterCandidates', () => {
  const candidates = ['アカマツ', 'スギ', 'ミズナラ'];

  it('空文字なら全候補を返す', () => {
    expect(narrowFilterCandidates(candidates, '')).toEqual(candidates);
    expect(narrowFilterCandidates(candidates, '  ')).toEqual(candidates);
  });

  it('部分一致で絞る（ひらがな入力でもカタカナに一致）', () => {
    expect(narrowFilterCandidates(candidates, 'マツ')).toEqual(['アカマツ']);
    expect(narrowFilterCandidates(candidates, 'すぎ')).toEqual(['スギ']);
  });
});

describe('boundingBoxFromRecords', () => {
  it('ポイントレコードを囲む矩形を返す', () => {
    const records = [
      { id: '1', coords: { latitude: 35, longitude: 135 } },
      { id: '2', coords: { latitude: 36, longitude: 137 } },
    ] as unknown as RecordType[];
    expect(boundingBoxFromRecords(records)).toEqual({ north: 36, south: 35, east: 137, west: 135 });
  });

  it('ライン等は構成点をすべて含める', () => {
    const records = [
      {
        id: '1',
        coords: [
          { latitude: 35, longitude: 135 },
          { latitude: 37, longitude: 139 },
        ],
      },
    ] as unknown as RecordType[];
    expect(boundingBoxFromRecords(records)).toEqual({ north: 37, south: 35, east: 139, west: 135 });
  });

  it('座標なしや0,0のレコードは除外する', () => {
    const records = [
      { id: '1', coords: undefined },
      { id: '2', coords: { latitude: 0, longitude: 0 } },
      { id: '3', coords: { latitude: 35, longitude: 135 } },
    ] as unknown as RecordType[];
    expect(boundingBoxFromRecords(records)).toEqual({ north: 35, south: 35, east: 135, west: 135 });
  });

  it('有効な座標がなければundefined', () => {
    const records = [{ id: '1', coords: undefined }] as unknown as RecordType[];
    expect(boundingBoxFromRecords(records)).toBeUndefined();
  });
});

describe('resolveAddLocation', () => {
  const currentLocation: LocationType = { latitude: 35, longitude: 135 };

  it('POINTでトグルONかつ現在地が取れていれば位置を付ける', () => {
    expect(
      resolveAddLocation({ layerType: 'POINT', isLocationEnabled: true, gpsState: 'follow', currentLocation })
    ).toEqual({ location: currentLocation, needsGpsWarning: false });
    expect(
      resolveAddLocation({ layerType: 'POINT', isLocationEnabled: true, gpsState: 'show', currentLocation })
    ).toEqual({ location: currentLocation, needsGpsWarning: false });
  });

  it('トグルONでもGPSが未起動なら位置を付けずに警告する', () => {
    expect(
      resolveAddLocation({ layerType: 'POINT', isLocationEnabled: true, gpsState: 'off', currentLocation })
    ).toEqual({ location: undefined, needsGpsWarning: true });
  });

  it('トグルONでも現在地が未取得なら位置を付けずに警告する', () => {
    expect(
      resolveAddLocation({
        layerType: 'POINT',
        isLocationEnabled: true,
        gpsState: 'follow',
        currentLocation: undefined,
      })
    ).toEqual({ location: undefined, needsGpsWarning: true });
  });

  it('トグルOFFなら位置も警告もなし', () => {
    expect(
      resolveAddLocation({ layerType: 'POINT', isLocationEnabled: false, gpsState: 'off', currentLocation: undefined })
    ).toEqual({ location: undefined, needsGpsWarning: false });
  });

  it('POINT以外はトグルONでも位置も警告もなし', () => {
    expect(
      resolveAddLocation({ layerType: 'LINE', isLocationEnabled: true, gpsState: 'off', currentLocation: undefined })
    ).toEqual({ location: undefined, needsGpsWarning: false });
    expect(
      resolveAddLocation({ layerType: 'POLYGON', isLocationEnabled: true, gpsState: 'follow', currentLocation })
    ).toEqual({ location: undefined, needsGpsWarning: false });
  });
});
