import React, { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { TrackLogType, LocationType } from '../../types';
import { getTrackChunk } from '../../utils/Location';

interface Props {
  data: TrackLogType;
}

// カスタム比較関数で不要な再レンダリングを防ぐ
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  const prev = prevProps.data;
  const next = nextProps.data;
  
  // savedChunkCountが変わった場合は再レンダリング必要
  if (prev.savedChunkCount !== next.savedChunkCount) {
    console.log(`[TrackLog] savedChunkCount changed: ${prev.savedChunkCount} -> ${next.savedChunkCount}`);
    return false;
  }
  
  // currentChunkの変更を検出（毎ポイント更新）
  const prevLength = prev.currentChunk?.length || 0;
  const nextLength = next.currentChunk?.length || 0;
  
  // currentChunkの長さが変わったら再レンダリング（5ポイントごと）
  // 超高速時の再レンダリング頻度を制限
  const UPDATE_INTERVAL = 5; // 5ポイントごとに更新
  
  if (Math.floor(prevLength / UPDATE_INTERVAL) !== Math.floor(nextLength / UPDATE_INTERVAL)) {
    // ログは50ポイントごとに出力（ログスパム防止）
    if (nextLength % 50 === 0) {
      console.log(`[TrackLog] currentChunk updated: ${prevLength} -> ${nextLength}`);
    }
    return false;
  }
  
  // チャンクリセット時は必ず更新
  if (nextLength === 0 && prevLength > 0) {
    console.log(`[TrackLog] currentChunk reset: ${prevLength} -> 0`);
    return false;
  }
  
  // それ以外は再レンダリング不要
  return true;
};

export const TrackLog = React.memo((props: Props) => {
  const { data } = props;
  
  // デバッグ: コンポーネントの呼び出し状況（10ポイントごとまたはチャンク境界でのみ）
  if ((data?.currentChunk?.length || 0) % 10 === 0 || data?.currentChunk?.length === 0) {
    console.log(`[TrackLog Render] savedChunkCount: ${data?.savedChunkCount}, currentChunk: ${data?.currentChunk?.length}`);
  }
  
  // 旧形式の互換性チェック
  if (data === undefined) return null;
  
  // 保存済みチャンクを結合して単一配列に（Polylineコンポーネント数を削減）
  const combinedSavedTrack = useMemo(() => {
    console.log(`[TrackLog useMemo] Starting chunk combination. savedChunkCount: ${data.savedChunkCount}`);
    
    if (!data.savedChunkCount || data.savedChunkCount === 0) {
      console.log(`[TrackLog useMemo] No chunks to combine, returning empty array`);
      return [];
    }
    
    // 10チャンクに増やしてテスト（5000ポイント）
    const MAX_CHUNKS_TO_COMBINE = 10;
    const chunksToLoad = Math.min(data.savedChunkCount, MAX_CHUNKS_TO_COMBINE);
    
    console.log(`[TrackLog] Combining ${chunksToLoad}/${data.savedChunkCount} chunks (max: ${MAX_CHUNKS_TO_COMBINE})`);
    
    const combined: LocationType[] = [];
    const startIndex = Math.max(0, data.savedChunkCount - MAX_CHUNKS_TO_COMBINE);
    
    // チャンクを順番に読み込んで結合
    try {
      for (let i = startIndex; i < startIndex + chunksToLoad; i++) {
        console.log(`[TrackLog] Loading chunk ${i}...`);
        const chunk = getTrackChunk(i);
        if (chunk && chunk.length > 0) {
          console.log(`[TrackLog] Chunk ${i} loaded: ${chunk.length} points`);
          combined.push(...(chunk as LocationType[]));
          console.log(`[TrackLog] Successfully added chunk ${i} to combined track`);
        } else {
          console.log(`[TrackLog] Chunk ${i} is empty or null`);
        }
      }
    } catch (error) {
      console.error(`[TrackLog] Error loading/combining chunks:`, error);
      return [];
    }
    
    console.log(`[TrackLog] Combined track: ${combined.length} total points`);
    return combined;
  }, [data.savedChunkCount]); // チャンク数が変わったときのみ再結合
  
  // 結合した表示（最大2つのPolylineコンポーネント）
  if (combinedSavedTrack.length > 0 || data.currentChunk) {
    return (
      <>
        {/* 保存済みチャンク（結合済み） - 単一のPolyline */}
        {combinedSavedTrack.length > 0 && (
          <Polyline
            key="combined-saved-track"
            tappable={false}
            coordinates={combinedSavedTrack}
            strokeColor={COLOR.TRACK}
            strokeWidth={4}
            lineCap="butt"
            zIndex={100}
          />
        )}
        
        {/* 現在記録中のチャンク - 別のPolyline */}
        {data.currentChunk && data.currentChunk.length > 0 && (
          <Polyline
            key="current-chunk"
            tappable={false}
            coordinates={data.currentChunk}
            strokeColor={COLOR.TRACK}
            strokeWidth={4}
            lineCap="butt"
            zIndex={101}
          />
        )}
      </>
    );
  }
  
  // 旧形式のフォールバック（displayBufferのみ表示）
  if (data.track.length === 0) return null;
  
  return (
    <Polyline
      tappable={false}
      coordinates={data.track}
      strokeColor={COLOR.TRACK}
      strokeWidth={4}
      lineCap="butt"
      zIndex={101}
    />
  );
}, arePropsEqual); // カスタム比較関数を使用