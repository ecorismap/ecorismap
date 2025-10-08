import React, { useEffect, useMemo, useState } from 'react';
import { Polyline } from 'react-native-maps';
import { InteractionManager } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';
import { getTrackChunkForDisplay } from '../../utils/Location';

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
  const [loadedChunks, setLoadedChunks] = useState<Record<number, LocationType[]>>({});
  
  // チャンクインデックスの配列を作成（メモ化）
  const chunkIndices = useMemo(() => {
    if (!savedChunkCount || savedChunkCount === 0) {
      return [];
    }
    
    // 0からsavedChunkCount-1までのインデックス配列を作成
    return Array.from({ length: savedChunkCount }, (_, i) => i);
  }, [savedChunkCount]);

  useEffect(() => {
    let isCancelled = false;
    setLoadedChunks({});

    if (chunkIndices.length === 0) {
      return;
    }

    const schedule = () =>
      new Promise<void>((resolve) => {
        if (InteractionManager && InteractionManager.runAfterInteractions) {
          InteractionManager.runAfterInteractions(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });

    const loadChunks = async () => {
      for (const index of chunkIndices) {
        if (isCancelled) break;
        await schedule();
        if (isCancelled) break;
        try {
          const chunk = getTrackChunkForDisplay(index, 320);
          if (!chunk || chunk.length === 0) {
            continue;
          }
          setLoadedChunks((prev) => {
            if (isCancelled || prev[index]) {
              return prev;
            }
            return { ...prev, [index]: chunk };
          });
        } catch (error) {
          console.error('Failed to load track chunk:', error);
        }
      }
    };

    loadChunks();

    return () => {
      isCancelled = true;
    };
  }, [chunkIndices]);
  
  // データがない場合は何も表示しない
  if (chunkIndices.length === 0) {
    return null;
  }
  
  // 各チャンクを個別のメモ化されたコンポーネントとして表示
  return (
    <>
      {chunkIndices.map((index) => {
        const chunk = loadedChunks[index];
        if (!chunk || chunk.length === 0) return null;
        return (
          <Polyline
            key={`saved-track-${index}`}
            tappable={false}
            coordinates={chunk}
            strokeColor={COLOR.TRACK}
            strokeWidth={4}
            lineCap="butt"
            zIndex={100}
          />
        );
      })}
    </>
  );
}, arePropsEqual);
