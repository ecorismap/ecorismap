import React, { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';
import { getTrackChunk } from '../../utils/Location';

interface Props {
  savedChunkCount: number;
}

// カスタム比較関数で不要な再レンダリングを防ぐ
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  // savedChunkCountが変わった場合のみ再レンダリング
  return prevProps.savedChunkCount === nextProps.savedChunkCount;
};

export const SavedTrackLog = React.memo((props: Props) => {
  const { savedChunkCount } = props;
  
  // 保存済みチャンクを結合して単一配列に（Polylineコンポーネント数を削減）
  const combinedSavedTrack = useMemo(() => {
    if (!savedChunkCount || savedChunkCount === 0) {
      return [];
    }
    
    // 最大5チャンクを結合（2500ポイント）
    const MAX_CHUNKS_TO_COMBINE = 5;
    const chunksToLoad = Math.min(savedChunkCount, MAX_CHUNKS_TO_COMBINE);
    
    const combined: LocationType[] = [];
    const startIndex = Math.max(0, savedChunkCount - MAX_CHUNKS_TO_COMBINE);
    
    // チャンクを順番に読み込んで結合
    try {
      for (let i = startIndex; i < startIndex + chunksToLoad; i++) {
        const chunk = getTrackChunk(i);
        if (chunk && chunk.length > 0) {
          combined.push(...(chunk as LocationType[]));
        }
      }
    } catch (error) {
      return [];
    }
    
    return combined;
  }, [savedChunkCount]); // チャンク数が変わったときのみ再結合
  
  // データがない場合は何も表示しない
  if (combinedSavedTrack.length === 0) {
    return null;
  }
  
  return (
    <Polyline
      key="saved-track"
      tappable={false}
      coordinates={combinedSavedTrack}
      strokeColor={COLOR.TRACK}
      strokeWidth={4}
      lineCap="butt"
      zIndex={100}
    />
  );
}, arePropsEqual);