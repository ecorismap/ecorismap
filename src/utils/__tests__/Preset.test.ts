import { LAYER_PRESETS, MAP_PRESETS, PRESET_LAYER_DATA } from '../../constants/Presets';
import { LayerPresetType } from '../../types';
import { createLayerFromPreset, createTileMapFromPreset } from '../Preset';

describe('createTileMapFromPreset', () => {
  const preset = MAP_PRESETS[0];

  it('渡したidが維持される', () => {
    const tileMap = createTileMapFromPreset(preset, 'MAP_ID');
    expect(tileMap.id).toBe('MAP_ID');
    expect(tileMap.name).toBe(preset.map.name);
    expect(tileMap.url).toBe(preset.map.url);
  });

  it('戻り値を変更してもプリセット定数が汚染されない', () => {
    const originalName = preset.map.name;
    const tileMap = createTileMapFromPreset(preset, 'MAP_ID');
    tileMap.name = 'changed';
    expect(preset.map.name).toBe(originalName);
  });
});

describe('createLayerFromPreset', () => {
  const dictionaryPreset: LayerPresetType = {
    presetId: 'test-preset',
    presetName: 'テスト',
    layer: {
      name: 'テスト',
      type: 'POINT',
      permission: 'PRIVATE',
      colorStyle: {
        colorType: 'SINGLE',
        transparency: 0.2,
        color: '#ff0000',
        fieldName: 'name',
        customFieldValue: '',
        colorRamp: 'RANDOM',
        colorList: [],
      },
      label: '',
      visible: true,
      active: true,
      field: [
        { name: '種名', format: 'STRING_DICTIONARY', useDictionaryAdd: true, dictionary: ['スギ', 'ヒノキ'] },
        { name: 'cmt', format: 'STRING' },
      ],
    },
  };

  it('layer idは維持されfield idは全て新規採番される', () => {
    const { layer } = createLayerFromPreset(dictionaryPreset, 'LAYER_ID');
    expect(layer.id).toBe('LAYER_ID');
    expect(layer.field).toHaveLength(2);
    const fieldIds = layer.field.map((f) => f.id);
    fieldIds.forEach((id) => expect(id).toBeTruthy());
    expect(new Set(fieldIds).size).toBe(fieldIds.length);
  });

  it('2回呼ぶとfield idが毎回異なる', () => {
    const layer1 = createLayerFromPreset(dictionaryPreset, 'LAYER_ID1').layer;
    const layer2 = createLayerFromPreset(dictionaryPreset, 'LAYER_ID2').layer;
    const ids1 = layer1.field.map((f) => f.id);
    const ids2 = layer2.field.map((f) => f.id);
    ids1.forEach((id) => expect(ids2).not.toContain(id));
  });

  it('辞書語彙は新しいfield idに紐づけて返され、fieldからdictionaryは除去される', () => {
    const { layer, dictionaries } = createLayerFromPreset(dictionaryPreset, 'LAYER_ID');
    expect(dictionaries).toHaveLength(1);
    expect(dictionaries[0].fieldId).toBe(layer.field[0].id);
    expect(dictionaries[0].values).toEqual(['スギ', 'ヒノキ']);
    layer.field.forEach((f) => expect(f).not.toHaveProperty('dictionary'));
  });

  it('dictionaryFieldIdはuseDictionaryAdd付き辞書フィールドの新idになる', () => {
    const { layer } = createLayerFromPreset(dictionaryPreset, 'LAYER_ID');
    expect(layer.dictionaryFieldId).toBe(layer.field[0].id);
  });

  it('動的辞書フィールドのuseDictionaryAddからもdictionaryFieldIdが設定される', () => {
    const dynamicPreset: LayerPresetType = {
      ...dictionaryPreset,
      layer: {
        ...dictionaryPreset.layer,
        field: [
          { name: '種名', format: 'STRING_DYNAMIC', useDictionaryAdd: true },
          { name: 'cmt', format: 'STRING' },
        ],
      },
    };
    const { layer, dictionaries } = createLayerFromPreset(dynamicPreset, 'LAYER_ID');
    expect(dictionaries).toHaveLength(0);
    expect(layer.dictionaryFieldId).toBe(layer.field[0].id);
  });

  it('辞書フィールドがないプリセットはdictionariesが空でdictionaryFieldIdはundefined', () => {
    const plainPreset: LayerPresetType = {
      ...dictionaryPreset,
      layer: { ...dictionaryPreset.layer, field: [{ name: 'name', format: 'STRING' }] },
    };
    const { layer, dictionaries } = createLayerFromPreset(plainPreset, 'LAYER_ID');
    expect(dictionaries).toHaveLength(0);
    expect(layer.dictionaryFieldId).toBeUndefined();
  });

  it('active=false, visible=true, グループ・ソート関連はundefinedに正規化される', () => {
    const { layer } = createLayerFromPreset(dictionaryPreset, 'LAYER_ID');
    expect(layer.active).toBe(false);
    expect(layer.visible).toBe(true);
    expect(layer.groupId).toBeUndefined();
    expect(layer.expanded).toBeUndefined();
    expect(layer.sortedName).toBeUndefined();
    expect(layer.sortedOrder).toBeUndefined();
  });

  it('戻り値を変更してもプリセット定数が汚染されない', () => {
    const preset = LAYER_PRESETS[0];
    const originalFieldName = preset.layer.field[0].name;
    const { layer } = createLayerFromPreset(preset, 'LAYER_ID');
    layer.field[0].name = 'changed';
    layer.colorStyle.colorList.push({ value: 'x', color: '#000000' });
    expect(preset.layer.field[0].name).toBe(originalFieldName);
    expect(preset.layer.colorStyle.colorList).not.toContainEqual({ value: 'x', color: '#000000' });
  });
});

describe('プリセット定数', () => {
  it('MAP_PRESETSのpresetIdがユニーク', () => {
    const ids = MAP_PRESETS.map((p) => p.presetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('LAYER_PRESETSのpresetIdがユニーク', () => {
    const ids = LAYER_PRESETS.map((p) => p.presetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dictionaryはSTRING_DICTIONARYフィールドにのみ定義されている', () => {
    LAYER_PRESETS.forEach((p) =>
      p.layer.field.forEach((f) => {
        if (f.dictionary !== undefined) expect(f.format).toBe('STRING_DICTIONARY');
      })
    );
  });

  it('dataKeyはPRESET_LAYER_DATAに実在する', () => {
    LAYER_PRESETS.forEach((p) => {
      if (p.dataKey !== undefined) {
        expect(PRESET_LAYER_DATA[p.dataKey]).toBeDefined();
      }
    });
  });

  it('同梱データのプロパティ名はレイヤのフィールド名と対応する', () => {
    // geoJson2Dataはフィールド名でプロパティを引くので、名前がズレると全て空になる
    LAYER_PRESETS.forEach((p) => {
      if (p.dataKey === undefined) return;
      const data = PRESET_LAYER_DATA[p.dataKey];
      const fieldNames = new Set(p.layer.field.map((f) => f.name));
      expect(p.layer.type).toBe('POINT');
      const sample = data.features[0];
      Object.keys(sample.properties ?? {}).forEach((key) => {
        expect(fieldNames.has(key)).toBe(true);
      });
      // ラベルに使うフィールドが存在すること
      expect(fieldNames.has(p.layer.label)).toBe(true);
    });
  });

  it('同梱データはプリセット由来のレイヤでgeoJson2Dataに全件取り込める', () => {
     
    const { geoJson2Data } = require('../Geometry');
    LAYER_PRESETS.forEach((p) => {
      if (p.dataKey === undefined) return;
      const data = PRESET_LAYER_DATA[p.dataKey];
      const { layer } = createLayerFromPreset(p, 'LAYER_ID');
      const records = geoJson2Data(data, layer, 'POINT', undefined, null);
      expect(records).toBeDefined();
      expect(records!.length).toBe(data.features.length);
      // ラベルフィールドに値が入っている
      const labeled = records!.filter((r: any) => r.field[p.layer.label] !== '');
      expect(labeled.length).toBeGreaterThan(records!.length * 0.9);
      expect(records![0].coords).toBeDefined();
    });
  });

  it('同梱データの全フィーチャが有効なPoint座標を持つ', () => {
    Object.values(PRESET_LAYER_DATA).forEach((data) => {
      expect(data.features.length).toBeGreaterThan(0);
      data.features.forEach((f) => {
        expect(f.geometry?.type).toBe('Point');
        if (f.geometry?.type === 'Point') {
          const [lon, lat] = f.geometry.coordinates;
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
        }
      });
    });
  });
});
