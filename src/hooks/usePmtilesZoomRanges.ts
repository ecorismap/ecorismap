import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import * as pmtiles from 'pmtiles';
import { RootState } from '../store';
import { TileMapType } from '../types';
import { withTileSignature } from '../utils/TileSignature';
import {
  getTileType,
  readPmtileHeaderIsVector,
  readPmtileZoomRange,
  TileZoomRange,
} from '../utils/tileDownloadHelpers';

type PmtileArchiveInfo = { zoom: TileZoomRange | undefined; isVector: boolean | undefined };

export type PmtilesArchiveInfos = {
  // 地図 ID ごとのヘッダーのズーム範囲。読めていない地図は含まない
  zoomRanges: Record<string, TileZoomRange>;
  // 地図 ID ごとのヘッダーの種別（ベクタか）。種別が分からない地図は含まない
  isVectors: Record<string, boolean>;
};

// 署名を除いた URL ごとに覚える。署名の更新のたびにヘッダーを取り直さないため
const archiveInfoCache = new Map<string, PmtileArchiveInfo>();

/** テスト用: 覚えたヘッダーの内容を捨てる */
export const clearPmtilesZoomRangeCache = () => archiveInfoCache.clear();

const EMPTY_INFOS: PmtilesArchiveInfos = { zoomRanges: {}, isVectors: {} };

const isSameInfos = (a: PmtilesArchiveInfos, b: PmtilesArchiveInfos): boolean => {
  const aZoomIds = Object.keys(a.zoomRanges);
  const aVectorIds = Object.keys(a.isVectors);
  return (
    aZoomIds.length === Object.keys(b.zoomRanges).length &&
    aZoomIds.every(
      (id) => b.zoomRanges[id]?.minZoom === a.zoomRanges[id].minZoom && b.zoomRanges[id]?.maxZoom === a.zoomRanges[id].maxZoom
    ) &&
    aVectorIds.length === Object.keys(b.isVectors).length &&
    aVectorIds.every((id) => b.isVectors[id] === a.isVectors[id])
  );
};

/**
 * ダウンロード対象の PMTiles のヘッダーのズーム範囲と種別（地図 ID ごと）。
 * 見積もりを実際のダウンロード（useTiles）と同じ範囲・同じベクタ/ラスタ判定で数えるために使う
 */
export const usePmtilesZoomRanges = (maps: TileMapType[]): PmtilesArchiveInfos => {
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  const [infos, setInfos] = useState<PmtilesArchiveInfos>(EMPTY_INFOS);

  useEffect(() => {
    let cancelled = false;
    const targets = maps.filter((map) => getTileType(map) === 'pmtiles');
    (async () => {
      const next: PmtilesArchiveInfos = { zoomRanges: {}, isVectors: {} };
      for (const map of targets) {
        let info = archiveInfoCache.get(map.url);
        if (info === undefined) {
          const pmtile = new pmtiles.PMTiles(withTileSignature(map.url, tileSignatures).replace('pmtiles://', ''));
          const zoom = await readPmtileZoomRange(pmtile);
          const isVector = await readPmtileHeaderIsVector(pmtile);
          info = { zoom, isVector };
          // 読めなかったときは覚えない（圏外から戻ったときなどに読み直す）
          if (zoom !== undefined || isVector !== undefined) archiveInfoCache.set(map.url, info);
        }
        if (info.zoom !== undefined) next.zoomRanges[map.id] = info.zoom;
        if (info.isVector !== undefined) next.isVectors[map.id] = info.isVector;
      }
      if (cancelled) return;
      setInfos((prev) => (isSameInfos(prev, next) ? prev : next));
    })();
    return () => {
      cancelled = true;
    };
  }, [maps, tileSignatures]);

  return infos;
};
