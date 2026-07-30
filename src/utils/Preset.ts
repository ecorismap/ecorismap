import { cloneDeep } from 'lodash';
import { ulid } from 'ulid';
import { LayerPresetType, LayerType, MapPresetType, TileMapType } from '../types';

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

  const field = source.field.map((f) => {
    const { dictionary, ...rest } = f;
    const newId = ulid();
    if (rest.format === 'STRING_DICTIONARY') {
      if (dictionary !== undefined && dictionary.length > 0) {
        dictionaries.push({ fieldId: newId, values: dictionary });
      }
      if (rest.useDictionaryAdd && dictionaryFieldId === undefined) {
        dictionaryFieldId = newId;
      }
    }
    return { ...rest, id: newId };
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
