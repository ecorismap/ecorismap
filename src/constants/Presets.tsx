import { FeatureCollection } from 'geojson';
import { LayerPresetType, MapPresetType } from '../types';
import mapPresetsJson from '../presets/mapPresets.json';
import layerPresetsJson from '../presets/layerPresets.json';
import msilIslandsJson from '../presets/data/msil_islands.json';
import msilUnderseaFeaturesJson from '../presets/data/msil_undersea_features.json';

// プリセットの実体はsrc/presets/のJSONで管理する（編集方法はsrc/presets/README.md参照）
export const MAP_PRESETS = mapPresetsJson as MapPresetType[];
export const LAYER_PRESETS = layerPresetsJson as LayerPresetType[];

// レイヤプリセットの同梱データ。キーはLayerPresetTypeのdataKey。
// 海しる由来のデータはscripts/fetch-msil-data.jsで再生成できる（出典: 海しる（海上保安庁））
export const PRESET_LAYER_DATA: Record<string, FeatureCollection> = {
  msil_islands: msilIslandsJson as unknown as FeatureCollection,
  msil_undersea_features: msilUnderseaFeaturesJson as unknown as FeatureCollection,
};
