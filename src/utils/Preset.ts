import { cloneDeep } from 'lodash';
import { ulid } from 'ulid';
import { FieldType, LayerPresetType, LayerType, MapPresetType, TileMapType } from '../types';
import { isCodeTargetFormat } from './Layer';

export type PresetDictionary = { fieldId: string; values: string[] };

export function createTileMapFromPreset(preset: MapPresetType, id: string): TileMapType {
  return { ...cloneDeep(preset.map), id };
}

// idは呼び出し側で採番済みのものを維持する（useLayerEditのセレクタがlayer.idをキーにするため）。
// fieldのidは新規採番し、辞書語彙は新しいフィールドIDに紐づけて返す（保存時に辞書DBへ登録する）。
export function createLayerFromPreset(
  preset: LayerPresetType,
  id: string
): { layer: LayerType; dictionaries: PresetDictionary[] } {
  const source = cloneDeep(preset.layer);
  const dictionaries: PresetDictionary[] = [];
  let dictionaryFieldId: string | undefined;

  //コードの入れ先はフィールド名で書かれているので、全フィールドのidを採番してから解決する
  const codeFieldNames: (string | undefined)[] = [];

  const field: FieldType[] = source.field.map((f) => {
    const { dictionary, codeFieldName, ...rest } = f;
    const newId = ulid();
    codeFieldNames.push(codeFieldName);
    if (rest.format === 'STRING_DICTIONARY' && dictionary !== undefined && dictionary.length > 0) {
      dictionaries.push({ fieldId: newId, values: dictionary });
    }
    // 「データ追加に使用」は辞書型・動的辞書型のどちらでも有効
    if (
      (rest.format === 'STRING_DICTIONARY' || rest.format === 'STRING_DYNAMIC') &&
      rest.useDictionaryAdd &&
      dictionaryFieldId === undefined
    ) {
      dictionaryFieldId = newId;
    }
    return { ...rest, id: newId };
  });

  field.forEach((f, i) => {
    const codeFieldName = codeFieldNames[i];
    if (codeFieldName === undefined) return;
    const codeField = field.find((c) => c.name === codeFieldName);
    //名前が合わない・形式が合わない場合は連動なしにする（プリセットの定義ミスで保存できなくならないように）
    if (codeField !== undefined && codeField.id !== f.id && isCodeTargetFormat(codeField.format)) {
      f.codeFieldId = codeField.id;
    }
  });

  return {
    layer: {
      ...source,
      id,
      field,
      active: false,
      visible: true,
      groupId: undefined,
      expanded: undefined,
      dictionaryFieldId,
      sortedName: undefined,
      sortedOrder: undefined,
    },
    dictionaries,
  };
}
