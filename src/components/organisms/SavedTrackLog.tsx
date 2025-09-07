import React, { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';
import { getTrackChunk } from '../../utils/Location';

interface Props {
  savedChunkCount: number;
}

// 個別のチャンクコンポーネント（一度レンダリングされたら変更されない）
interface ChunkProps {
  chunkIndex: number;
}

const TrackChunk = React.memo(({ chunkIndex }: ChunkProps) => {
  // チャンクデータは一度読み込まれたら変わらない
  const chunkData = useMemo(() => {
    try {
      const chunk = getTrackChunk(chunkIndex);
      return chunk && chunk.length > 0 ? (chunk as LocationType[]) : null;
    } catch (error) {
      return null;
    }
  }, [chunkIndex]);

  if (!chunkData) {
    return null;
  }

  return (
    <Polyline
      key={`saved-track-${chunkIndex}`}
      tappable={false}
      coordinates={chunkData}
      strokeColor={COLOR.TRACK}
      strokeWidth={4}
      lineCap="butt"
      zIndex={100}
    />
  );
}, (prevProps, nextProps) => {
  // chunkIndexが同じなら再レンダリングしない（チャンクの内容は不変）
  return prevProps.chunkIndex === nextProps.chunkIndex;
});

// カスタム比較関数で不要な再レンダリングを防ぐ
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  // savedChunkCountが変わった場合のみ再レンダリング
  return prevProps.savedChunkCount === nextProps.savedChunkCount;
};

export const SavedTrackLog = React.memo((props: Props) => {
  const { savedChunkCount } = props;
  
  // チャンクインデックスの配列を作成（メモ化）
  const chunkIndices = useMemo(() => {
    if (!savedChunkCount || savedChunkCount === 0) {
      return [];
    }
    
    // 0からsavedChunkCount-1までのインデックス配列を作成
    return Array.from({ length: savedChunkCount }, (_, i) => i);
  }, [savedChunkCount]);
  
  // データがない場合は何も表示しない
  if (chunkIndices.length === 0) {
    return null;
  }
  
  // 各チャンクを個別のメモ化されたコンポーネントとして表示
  return (
    <>
      {chunkIndices.map((index) => (
        <TrackChunk key={`track-chunk-${index}`} chunkIndex={index} />
      ))}
    </>
  );
}, arePropsEqual);