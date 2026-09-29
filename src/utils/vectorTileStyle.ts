/**
 * Web（maplibre）のベクタタイル（PMTiles・pbf）のソースとスタイル。
 * 地図表示（Home.web.tsx）とPDF出力（pdfExport/webPmtiles.ts）で共有し、PDFの見た目を地図とそろえる
 */
import {
  BackgroundLayerSpecification,
  FillLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SourceSpecification,
} from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import { TileMapType } from '../types';
import { db } from './db';
import { TileSignaturesType, withTileSignature } from './TileSignature';

//ラベルのフォント
export const VECTOR_GLYPHS_URL = 'https://map.ecoris.info/glyphs/{fontstack}/{range}.pbf';

/**
 * PMTilesファイルのメタデータからデフォルトのベクタースタイルを生成
 * @param tileMap 対象のタイルマップ
 * @returns デフォルトのレイヤースタイル配列
 */
const getDefaultStyle = async (tileMap: TileMapType, tileSignatures: TileSignaturesType) => {
  try {
    const pmtile = new pmtiles.PMTiles(withTileSignature(tileMap.url, tileSignatures).replace('pmtiles://', ''));
    const metadata: any = await pmtile.getMetadata();

    //const header = await pmtile.getHeader();
    let layers_: LayerSpecification[] = [];

    if (metadata.type !== 'baselayer') {
      layers_ = [];
    }

    let vector_layers: LayerSpecification[];
    if (metadata.json) {
      const j = JSON.parse(metadata.json);
      vector_layers = j.vector_layers;
    } else {
      vector_layers = metadata.vector_layers;
    }

    if (vector_layers) {
      for (const layer of vector_layers) {
        layers_.push({
          id: layer.id + '_fill',
          type: 'fill',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'fill-color': '#00FF00',
            'fill-outline-color': '#000000',
            'fill-opacity': 0.5,
          },
          filter: ['==', ['geometry-type'], 'Polygon'],
        });
        layers_.push({
          id: layer.id + '_stroke',
          type: 'line',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'line-color': '#0000FF',
            'line-width': 1,
          },
          filter: ['==', ['geometry-type'], 'LineString'],
        });
        layers_.push({
          id: layer.id + '_point',
          type: 'circle',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'circle-color': '#FF0000',
            'circle-radius': 3,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#FFFFFF',
          },
          filter: ['==', ['geometry-type'], 'Point'],
        });
      }
    }
    //console.log('layers_', layers_);
    return layers_ as LineLayerSpecification[] | FillLayerSpecification[];
  } catch (e) {
    console.log(e);
    return [];
  }
};

/**
 * ローカルストレージ（IndexedDB）からベクタースタイルを取得
 * @param tileMap 対象のタイルマップ
 * @returns レイヤースタイル配列
 */
const getStyleFromLocal = async (tileMap: TileMapType) => {
  const style = (await db.pmtiles.get(tileMap.id))?.style;
  if (style) {
    const layerStyles = JSON.parse(style).layers as LineLayerSpecification[] | FillLayerSpecification[];
    if (Array.isArray(layerStyles)) return layerStyles;
  }
  return [];
};

/**
 * 外部URLからベクタースタイルを取得
 * @param tileMap 対象のタイルマップ
 * @returns レイヤースタイル配列
 */
const getStyleFromURL = async (tileMap: TileMapType, tileSignatures: TileSignaturesType) => {
  const url = tileMap.styleURL;
  if (!url) return [];
  const response = await fetch(withTileSignature(url, tileSignatures));
  if (response.ok) {
    const json = await response.json();
    if (json) {
      const layerStyles = json.layers;
      if (Array.isArray(layerStyles)) return layerStyles as LineLayerSpecification[] | FillLayerSpecification[];
    }
  }
  return [];
};

/**
 * ベクタータイル用のレイヤー定義を生成（非同期処理）
 * スタイル情報を取得し、透過度を適用して返す
 * @param tileMap 対象のタイルマップ
 * @returns ベクターレイヤー定義の配列
 */
export const getVectorLayerStyles = async (tileMap: TileMapType, tileSignatures: TileSignaturesType) => {
  let layerStyles: LineLayerSpecification[] | FillLayerSpecification[] | BackgroundLayerSpecification[] = [];
  if (tileMap.styleURL && tileMap.styleURL.startsWith('style://')) {
    layerStyles = await getStyleFromLocal(tileMap);
  } else if (tileMap.styleURL && tileMap.styleURL !== '') {
    layerStyles = await getStyleFromURL(tileMap, tileSignatures);
  }
  //Pmtilesのスタイルがない場合はデフォルトスタイルを取得.
  //pbfの場合はメタデータの取得方法が異なるため、デフォルトスタイルを取得しない
  if (layerStyles.length === 0) {
    if (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles')) {
      layerStyles = await getDefaultStyle(tileMap, tileSignatures);
    } else {
      return [];
    }
  }
  //レイヤのIDをtileMapのIDとインデックスで設定
  //スタイルの透過設定とレイヤの透過設定を統合
  const updatedLayers = layerStyles.map(
    (layerStyle: LineLayerSpecification | FillLayerSpecification | BackgroundLayerSpecification, index: number) => {
      const newLayerStyle = { ...layerStyle };
      newLayerStyle.id = `${tileMap.id}_${index}`;
      if (newLayerStyle.type !== 'background' && newLayerStyle.source) {
        newLayerStyle.source = `${tileMap.id}`;
      }

      if (newLayerStyle.type === 'fill' && newLayerStyle.paint) {
        if (
          newLayerStyle.paint['fill-opacity'] !== undefined &&
          typeof newLayerStyle.paint['fill-opacity'] === 'number'
        ) {
          newLayerStyle.paint['fill-opacity'] = newLayerStyle.paint['fill-opacity'] * (1 - tileMap.transparency);
        } else {
          newLayerStyle.paint['fill-opacity'] = 1 - tileMap.transparency;
        }
      } else if (newLayerStyle.type === 'background' && newLayerStyle.paint) {
        if (
          newLayerStyle.paint['background-opacity'] &&
          typeof newLayerStyle.paint['background-opacity'] === 'number'
        ) {
          newLayerStyle.paint['background-opacity'] =
            newLayerStyle.paint['background-opacity'] * (1 - tileMap.transparency);
        } else {
          newLayerStyle.paint['background-opacity'] = 1 - tileMap.transparency;
        }
      }
      return newLayerStyle;
    }
  );

  return updatedLayers;
};

/**
 * PMTiles（ベクタ/ラスタ）・pbfのmaplibreソース定義。それ以外の地図はundefined
 */
export const getPmtilesSource = (
  tileMap: TileMapType,
  tileSignatures: TileSignaturesType
): SourceSpecification | undefined => {
  if (tileMap.url && (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles'))) {
    return {
      type: tileMap.isVector ? 'vector' : 'raster',
      url: withTileSignature(tileMap.url.startsWith('pmtiles://') ? tileMap.url : 'pmtiles://' + tileMap.url, tileSignatures),
      minzoom: tileMap.minimumZ,
      maxzoom: tileMap.overzoomThreshold,
      scheme: 'xyz',
      tileSize: tileMap.isVector ? 512 : 256,
      attribution: tileMap.attribution,
    };
  }
  if (tileMap.url.includes('.pbf')) {
    return {
      type: 'vector',
      tiles: [withTileSignature(tileMap.url, tileSignatures)],
      minzoom: tileMap.minimumZ,
      maxzoom: tileMap.maximumZ,
      scheme: 'xyz',
      tileSize: 512,
      attribution: tileMap.attribution,
      //maplibreのベクタソースも実行時はtileSizeを受け付ける（型に無いだけ）。地図表示の従来の指定を保つ
    } as SourceSpecification;
  }
  return undefined;
};
