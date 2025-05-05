import { RecordType } from '../../types';
import { sortData, getInitialFieldValue, mergeLayerData } from '../Data';

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
