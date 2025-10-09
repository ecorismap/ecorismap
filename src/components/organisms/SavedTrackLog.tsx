import React, { useEffect, useMemo, useState } from 'react';
import { Polyline } from 'react-native-maps';
import { InteractionManager } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';
import { getTrackChunkForDisplay } from '../../utils/Location';

interface Props {
  savedChunkCount: number;
}

interface ChunkProps {
  chunkIndex: number;
}

const TrackChunk = React.memo(({ chunkIndex }: ChunkProps) => {
  const [chunkData, setChunkData] = useState<LocationType[] | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (InteractionManager && InteractionManager.runAfterInteractions) {
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      if (isCancelled) return;

      try {
        const chunk = getTrackChunkForDisplay(chunkIndex, 320);
        if (!isCancelled && chunk && chunk.length > 0) {
          setChunkData(chunk);
        } else if (!isCancelled) {
          setChunkData(null);
        }
      } catch (error) {
        console.error('Failed to load track chunk:', error);
        if (!isCancelled) {
          setChunkData(null);
        }
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
  }, [chunkIndex]);

  if (!chunkData || chunkData.length === 0) {
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
}, (prevProps, nextProps) => prevProps.chunkIndex === nextProps.chunkIndex);

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
