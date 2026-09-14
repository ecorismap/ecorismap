import { COLOR } from '../../constants/AppConstants';
import { LayerType } from '../../types';
import { getColor, getColorRule, changeLayerId, applyColorStyle, getLineWidth, getLineWidthAtZoom, toIndividualColorLayer, restoreColorStyleFromIndividual, resolveCodeField, toCodeFieldValue, checkLayerInputs } from '../Layer';
import { getUserColor } from '../Color';

describe('getColor', () => {
  const layer: LayerType = {
    id: '1',
    name: 'トラック',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: 'name',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 1,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [
      { id: '1-0', name: 'name', format: 'SERIAL' },
      { id: '1-1', name: 'time', format: 'DATETIME' },
      { id: '1-2', name: 'cmt', format: 'STRING' },
    ],
  };
  const feature = {
    id: '0',
    userId: undefined,
    displayName: 'user1',
    checked: false,
    visible: true,
    type: 'LINE',
    redraw: false,
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ],
    field: { name: 'abc' },
  };

  it('return single feature color', () => {
    expect(getColor(layer, feature)).toBe('rgba(255, 0, 0, 1)');
  });
  it('return categorized feature color', () => {
    const layer2: LayerType = {
      ...layer,
      colorStyle: {
        colorType: 'CATEGORIZED',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        customFieldValue: '',
        colorList: [{ value: 'abc', color: '#00ff00' }],
        transparency: 1,
      },
    };

    expect(getColor(layer2, feature)).toBe('rgba(0, 255, 0, 1)');
  });
  // it('return user feature color', () => {
  //   const layer3: LayerType = {
  //     ...layer,
  //     colorStyle: {
  //       colorType: 'USER',
  //       color: COLOR.RED,
  //       fieldName: 'name',
  //       colorRamp: 'RANDOM',
  //       customFieldValue: '',
  //       colorList: [{ value: 'user1', color: '#0000ff' }],
  //       transparency: 1,
  //     },
  //   };
  //   expect(getColor(layer3, feature)).toBe('#0000ff');
  // });
});

describe('getLineWidth', () => {
  const layer: LayerType = {
    id: '1',
    name: 'ライン',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'CATEGORIZED',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 1,
      lineWidth: 3,
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };
  const record = (field: any) => ({ id: '0', visible: true, redraw: false, coords: undefined, field } as any);

  const individualLayer = {
    ...layer,
    colorStyle: { ...layer.colorStyle, colorType: 'INDIVIDUAL', fieldName: '__CUSTOM', customFieldValue: '_strokeColor' },
  } as LayerType;

  it('色分けが個別のレイヤではレコードの太さを使う', () => {
    expect(getLineWidth(individualLayer, record({ _strokeWidth: 10 }))).toBe(10);
  });

  it('色分けが個別以外のレイヤではレコードが太さを持っていてもレイヤの太さ（デフォルト）を使う', () => {
    expect(getLineWidth(layer, record({ _strokeWidth: 10 }))).toBe(3);
  });

  it('レコードが太さを持たない場合はレイヤの太さを使う', () => {
    expect(getLineWidth(layer, record({}))).toBe(3);
  });

  it('数値でない_strokeWidth（再インポートの空文字など）は無視してレイヤの太さを使う', () => {
    expect(getLineWidth(individualLayer, record({ _strokeWidth: '' }))).toBe(3);
  });

  it('どちらも無い場合は既定値になる', () => {
    const noWidth = { ...layer, colorStyle: { ...layer.colorStyle, lineWidth: undefined } };
    expect(getLineWidth(noWidth, record({}))).toBe(1.5);
  });
});

describe('getLineWidthAtZoom', () => {
  const layer: LayerType = {
    id: '1',
    name: 'ライン',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'INDIVIDUAL',
      color: COLOR.RED,
      fieldName: '__CUSTOM',
      colorRamp: 'RANDOM',
      customFieldValue: '_strokeColor',
      colorList: [],
      transparency: 1,
      lineWidth: 3,
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };
  const record = (field: any) => ({ id: '0', visible: true, redraw: false, coords: undefined, field } as any);

  it('色分けが個別以外のレイヤはズーム連動せずレイヤの太さのまま', () => {
    const categorized = { ...layer, colorStyle: { ...layer.colorStyle, colorType: 'CATEGORIZED' } } as LayerType;
    expect(getLineWidthAtZoom(categorized, record({ _strokeWidth: 10, _zoom: 15 }), 12)).toBe(3);
  });

  it('描画時ズームと同じなら固定幅', () => {
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 15 }), 15)).toBe(10);
  });

  it('ズームインしても太くならず画面上の太さを維持する', () => {
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 15 }), 17)).toBe(10);
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 15 }), 20)).toBe(10);
  });

  it('ズームアウトすると1/2^nに縮小される', () => {
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 15 }), 14)).toBe(5);
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 15 }), 13)).toBe(2.5);
  });

  it('_zoomを持たない旧レコードは常に固定幅', () => {
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10 }), 10)).toBe(10);
  });

  it('_zoomが0や数値以外（再インポートの空文字など）は固定幅', () => {
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: 0 }), 10)).toBe(10);
    expect(getLineWidthAtZoom(layer, record({ _strokeWidth: 10, _zoom: '' }), 10)).toBe(10);
  });

  it('_strokeWidthを持たないレコードはレイヤ既定幅を基準に縮小', () => {
    expect(getLineWidthAtZoom(layer, record({ _zoom: 15 }), 14)).toBe(1.5);
  });
});

describe('applyColorStyle', () => {
  const memoLayer: LayerType = {
    id: '1',
    name: 'メモ',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'INDIVIDUAL',
      color: COLOR.RED,
      fieldName: '__CUSTOM',
      colorRamp: 'RANDOM',
      customFieldValue: '_strokeColor',
      colorList: [],
      transparency: 1,
      savedFieldName: '区分',
      savedCustomFieldValue: '',
      savedLabel: '種名',
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };

  it('カラータイプが[個別]のままなら退避したラベルは復元しない', () => {
    const result = applyColorStyle(memoLayer, memoLayer.colorStyle);
    expect(result.label).toBe('');
    expect(result.colorStyle.savedLabel).toBe('種名');
  });

  it('カラータイプを戻すと退避したラベルが復元され、退避データは消える', () => {
    const restored = applyColorStyle(memoLayer, {
      ...memoLayer.colorStyle,
      colorType: 'CATEGORIZED',
      fieldName: '区分',
      customFieldValue: '',
      savedFieldName: undefined,
      savedCustomFieldValue: undefined,
    });
    expect(restored.label).toBe('種名');
    expect(restored.colorStyle.savedLabel).toBeUndefined();
  });
});

describe('toIndividualColorLayer / restoreColorStyleFromIndividual', () => {
  const surveyLayer: LayerType = {
    id: '1',
    name: '飛翔図',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'CATEGORIZED',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 1,
    },
    label: '種名',
    visible: true,
    active: true,
    field: [],
  };

  it('個別へ切り替えると元の色分けとラベルが退避され、ラベルは非表示になる', () => {
    const individual = toIndividualColorLayer(surveyLayer);
    expect(individual.colorStyle.colorType).toBe('INDIVIDUAL');
    expect(individual.colorStyle.customFieldValue).toBe('_strokeColor');
    expect(individual.label).toBe('');
    expect(individual.colorStyle.savedFieldName).toBe('区分');
    expect(individual.colorStyle.savedLabel).toBe('種名');
  });

  it('個別から戻すと退避した色分けとラベルが復元され、退避データは消える', () => {
    const restored = restoreColorStyleFromIndividual(toIndividualColorLayer(surveyLayer));
    expect(restored.colorStyle.colorType).toBe('SINGLE');
    expect(restored.colorStyle.fieldName).toBe('区分');
    expect(restored.label).toBe('種名');
    expect(restored.colorStyle.savedFieldName).toBeUndefined();
    expect(restored.colorStyle.savedLabel).toBeUndefined();
  });
});

describe('test ecorismap', function () {
  it('test ecorismap.updateLayerIds', function (done) {
    const layer: LayerType = {
      id: '1',
      name: 'トラック',
      type: 'LINE',
      permission: 'PRIVATE',
      colorStyle: {
        colorType: 'SINGLE',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        colorList: [],
        customFieldValue: '',
        transparency: 1,
      },
      label: 'name',
      visible: true,
      active: true,
      field: [
        { id: '1-0', name: 'name', format: 'SERIAL' },
        { id: '1-1', name: 'time', format: 'DATETIME' },
        { id: '1-2', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.id).not.toEqual(layer.id);
    expect(newLayer.field[0].id).not.toEqual(layer.field[0].id);
    done();
  });
});

describe('changeLayerId dictionaryFieldId', () => {
  const baseLayer: LayerType = {
    id: '1',
    name: 'ポイント',
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: 'name',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: 1,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [],
  };

  it('辞書型フィールドのuseDictionaryAddからdictionaryFieldIdを引き継ぐ', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING_DICTIONARY', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBe(newLayer.field[0].id);
    expect(newLayer.field[0].useDictionaryAdd).toBe(true);
  });

  it('動的辞書型フィールドのuseDictionaryAddからもdictionaryFieldIdを引き継ぐ', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING_DYNAMIC', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBe(newLayer.field[0].id);
    expect(newLayer.field[0].useDictionaryAdd).toBe(true);
  });

  it('辞書型以外に残留したuseDictionaryAddは解除しdictionaryFieldIdを設定しない', () => {
    const layer: LayerType = {
      ...baseLayer,
      field: [
        { id: '1-0', name: 'species', format: 'STRING', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBeUndefined();
    expect(newLayer.field[0].useDictionaryAdd).toBe(false);
  });

  it('辞書型以外を指すdictionaryFieldIdは引き継がない', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING' },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBeUndefined();
  });
});

describe('getColor/getColorRule USERフォールバック', () => {
  const baseLayer: LayerType = {
    id: 'track',
    name: 'トラック',
    type: 'LINE',
    permission: 'PUBLIC',
    colorStyle: {
      colorType: 'USER',
      color: COLOR.RED,
      fieldName: '',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [{ value: 'user1', color: '#00ff00' }],
      transparency: 1,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [],
  };
  const featureOf = (displayName: string | null) => ({
    id: '0',
    userId: undefined,
    displayName,
    checked: false,
    visible: true,
    type: 'LINE',
    redraw: false,
    coords: [],
    field: {},
  });

  it('colorListにあるユーザーはその色', () => {
    expect(getColor(baseLayer, featureOf('user1') as any)).toBe('rgba(0, 255, 0, 1)');
  });
  it('colorListに無いユーザーは透明ではなく決定的な色（色設定後に参加したメンバーも見える）', () => {
    expect(getColor(baseLayer, featureOf('newcomer') as any)).toBe(getUserColor('newcomer'));
  });
  it('displayNameが無ければ従来どおり透明', () => {
    expect(getColor(baseLayer, featureOf(null) as any)).toBe('rgba(0,0,0,0)');
  });
  it('getColorRuleも同じ規則でフォールバックする', () => {
    expect(getColorRule(baseLayer, 'newcomer')).toBe(getUserColor('newcomer'));
    expect(getColorRule(baseLayer, 'user1')).toBe('rgba(0, 255, 0, 1)');
  });
});


describe('resolveCodeField / toCodeFieldValue', () => {
  const layerOf = (field: LayerType['field']): LayerType => ({
    id: '1',
    name: '植生図',
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'CATEGORIZED',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: false,
    },
    label: '',
    visible: true,
    active: true,
    field,
  });

  it('コードの入れ先を指していれば、そのフィールドを返す', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f2' },
      { id: 'f2', name: '区分コード', format: 'STRING' },
    ]);
    expect(resolveCodeField(layer, layer.field[0])?.id).toBe('f2');
  });

  it('未設定・空文字は連動なし', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [] },
      { id: 'f2', name: '区分コード', format: 'STRING', codeFieldId: '' },
    ]);
    expect(resolveCodeField(layer, layer.field[0])).toBeUndefined();
    expect(resolveCodeField(layer, layer.field[1])).toBeUndefined();
  });

  it('LIST/RADIO以外は連動しない', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'STRING', codeFieldId: 'f2' },
      { id: 'f2', name: '区分コード', format: 'STRING' },
    ]);
    expect(resolveCodeField(layer, layer.field[0])).toBeUndefined();
  });

  it('入れ先が不適格な形式なら連動しない', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'RADIO', list: [], codeFieldId: 'f2' },
      { id: 'f2', name: '写真', format: 'PHOTO' },
    ]);
    expect(resolveCodeField(layer, layer.field[0])).toBeUndefined();
  });

  it('自分自身や存在しないidは連動しない', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f1' },
      { id: 'f2', name: '種名', format: 'LIST', list: [], codeFieldId: 'missing' },
    ]);
    expect(resolveCodeField(layer, layer.field[0])).toBeUndefined();
    expect(resolveCodeField(layer, layer.field[1])).toBeUndefined();
  });

  it('コードは入れ先の形式に合わせる', () => {
    expect(toCodeFieldValue('12', 'STRING')).toBe('12');
    expect(toCodeFieldValue('12', 'INTEGER')).toBe(12);
    expect(toCodeFieldValue('1.5', 'DECIMAL')).toBe(1.5);
    //コードの無い選択肢・その他は空値
    expect(toCodeFieldValue(undefined, 'STRING')).toBe('');
    expect(toCodeFieldValue('', 'INTEGER')).toBe(0);
    expect(toCodeFieldValue('abc', 'DECIMAL')).toBe(0);
  });
});

describe('checkLayerInputs コードの入れ先', () => {
  const layerOf = (field: LayerType['field']): LayerType => ({
    id: '1',
    name: '植生図',
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: false,
    },
    label: '',
    visible: true,
    active: true,
    field,
  });

  it('正しい設定は保存できる', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f2' },
      { id: 'f2', name: '区分コード', format: 'STRING' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(true);
  });

  it('存在しないidを指していたら止める', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'missing' },
      { id: 'f2', name: '区分コード', format: 'STRING' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });

  it('入れ先が不適格な形式なら止める', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f2' },
      { id: 'f2', name: '写真', format: 'PHOTO' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });

  it('同じ入れ先を複数のフィールドが指したら止める（後勝ちで壊れるため）', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f3' },
      { id: 'f2', name: '種名', format: 'LIST', list: [], codeFieldId: 'f3' },
      { id: 'f3', name: 'コード', format: 'STRING' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });
});

describe('changeLayerId codeFieldId', () => {
  const baseLayer: LayerType = {
    id: '1',
    name: '植生図',
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: false,
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };

  it('新しいフィールドIDへ付け替える（インポートや複製で連動が切れない）', () => {
    const layer: LayerType = {
      ...baseLayer,
      field: [
        { id: 'f1', name: '区分', format: 'LIST', list: [], codeFieldId: 'f2' },
        { id: 'f2', name: '区分コード', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.field[0].id).not.toBe('f1');
    expect(newLayer.field[0].codeFieldId).toBe(newLayer.field[1].id);
  });

  it('連動していないフィールドはundefinedのまま', () => {
    const layer: LayerType = {
      ...baseLayer,
      field: [{ id: 'f1', name: '区分', format: 'LIST', list: [] }],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.field[0].codeFieldId).toBeUndefined();
  });
});


describe('checkLayerInputs 選択肢・コードの重複', () => {
  const layerOf = (field: LayerType['field']): LayerType => ({
    id: '1',
    name: '植生図',
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: false,
    },
    label: '',
    visible: true,
    active: true,
    field,
  });

  const listField = (list: { value: string; isOther: boolean; customFieldValue: string }[], format: 'LIST' | 'RADIO' | 'CHECK' = 'LIST') =>
    layerOf([{ id: 'f1', name: '区分', format, list }]);

  it('選択肢が重複していたら止める', () => {
    const layer = listField([
      { value: '草地', isOther: false, customFieldValue: '1' },
      { value: '草地', isOther: false, customFieldValue: '2' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });

  it('コードが重複していたら止める', () => {
    const layer = listField([
      { value: '草地', isOther: false, customFieldValue: '1' },
      { value: '樹林', isOther: false, customFieldValue: '1' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });

  it('コードが空の選択肢は重複扱いしない', () => {
    const layer = listField([
      { value: '草地', isOther: false, customFieldValue: '' },
      { value: '樹林', isOther: false, customFieldValue: '' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(true);
  });

  it('空欄の選択肢は入力途中なので重複扱いしない', () => {
    const layer = listField([
      { value: '', isOther: false, customFieldValue: '' },
      { value: '', isOther: false, customFieldValue: '' },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(true);
  });

  it('RADIOも同じ規則で見る', () => {
    const layer = listField(
      [
        { value: '草地', isOther: false, customFieldValue: '1' },
        { value: '樹林', isOther: false, customFieldValue: '1' },
      ],
      'RADIO'
    );
    expect(checkLayerInputs(layer).isOK).toBe(false);
  });

  it('CHECKは値の重複だけ見る（コードは持たない）', () => {
    const dupCode = listField(
      [
        { value: '草地', isOther: false, customFieldValue: '1' },
        { value: '樹林', isOther: false, customFieldValue: '1' },
      ],
      'CHECK'
    );
    expect(checkLayerInputs(dupCode).isOK).toBe(true);
    const dupValue = listField(
      [
        { value: '草地', isOther: false, customFieldValue: '1' },
        { value: '草地', isOther: false, customFieldValue: '2' },
      ],
      'CHECK'
    );
    expect(checkLayerInputs(dupValue).isOK).toBe(false);
  });

  it('参照型（REFERENCE）のlistは対象外', () => {
    const layer = layerOf([
      {
        id: 'f1',
        name: '参照',
        format: 'REFERENCE',
        list: [
          { value: 'L2', isOther: false, customFieldValue: '' },
          { value: 'name', isOther: false, customFieldValue: '' },
          { value: 'name', isOther: false, customFieldValue: '' },
        ],
      },
    ]);
    expect(checkLayerInputs(layer).isOK).toBe(true);
  });
});


describe('複数選択（CHECK）はコード連動の対象外', () => {
  it('CHECKにcodeFieldIdが残っていても連動しない（コードが1つに定まらないため）', () => {
    const layer: LayerType = {
      id: '1',
      name: '調査',
      type: 'POINT',
      permission: 'PRIVATE',
      colorStyle: {
        colorType: 'SINGLE',
        color: COLOR.RED,
        fieldName: '',
        colorRamp: 'RANDOM',
        colorList: [],
        customFieldValue: '',
        transparency: 1,
      },
      label: '',
      visible: true,
      active: true,
      field: [
        { id: 'f1', name: '出現種', format: 'CHECK', codeFieldId: 'f2', list: [] },
        { id: 'f2', name: '種コード', format: 'STRING' },
      ],
    };
    expect(resolveCodeField(layer, layer.field[0])).toBeUndefined();
  });
});
