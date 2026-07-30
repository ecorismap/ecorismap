import { LayerPresetType, MapPresetType } from '../types';
import mapPresetsJson from '../presets/mapPresets.json';
import layerPresetsJson from '../presets/layerPresets.json';

// プリセットの実体はsrc/presets/のJSONで管理する（編集方法はsrc/presets/README.md参照）
export const MAP_PRESETS = mapPresetsJson as MapPresetType[];
export const LAYER_PRESETS = layerPresetsJson as LayerPresetType[];
