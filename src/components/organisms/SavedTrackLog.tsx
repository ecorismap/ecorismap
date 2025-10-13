import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';
import { getTrackChunkForDisplay } from '../../utils/Location';
import { AppStateContext } from '../../contexts/AppState';

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
  const loadedChunksRef = useRef<Record<number, LocationType[]>>({});
  const { setLoading } = useContext(AppStateContext);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const loadingControlRef = useRef(false);
  
  // チャンクインデックスの配列を作成（メモ化）
  const chunkIndices = useMemo(() => {
    if (!savedChunkCount || savedChunkCount === 0) {
      return [];
    }
    
    // 0からsavedChunkCount-1までのインデックス配列を作成
    return Array.from({ length: savedChunkCount }, (_, i) => i);
  }, [savedChunkCount]);

  useEffect(() => {
    loadedChunksRef.current = loadedChunks;
  }, [loadedChunks]);

  useEffect(() => {
    if (chunkIndices.length === 0) {
      if (Object.keys(loadedChunksRef.current).length > 0) {
        setLoadedChunks({});
        loadedChunksRef.current = {};
      }
      return;
    }

    // 余分なチャンクを削除（データ削減）
    setLoadedChunks((prev) => {
      const next: Record<number, LocationType[]> = {};
      let changed = false;
      for (const index of chunkIndices) {
        if (prev[index]) {
          next[index] = prev[index];
        } else {
          changed = true;
        }
      }
      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      loadedChunksRef.current = next;
      return next;
    });
  }, [chunkIndices]);

  useEffect(() => {
    if (chunkIndices.length === 0) {
      setIsInitialLoading(false);
      return;
    }

    let isCancelled = false;

    const schedule = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const needInitialLoad = chunkIndices.some((index) => !loadedChunksRef.current[index]);
    if (!needInitialLoad) {
      setIsInitialLoading(false);
    } else {
      setIsInitialLoading(true);
    }

    const loadChunks = async () => {
      for (const index of chunkIndices) {
        if (isCancelled) break;

        if (loadedChunksRef.current[index]) {
          continue;
        }

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
            const next = { ...prev, [index]: chunk };
            loadedChunksRef.current = next;
            return next;
          });
        } catch (error) {
          console.error('Failed to load track chunk:', error);
        }
      }

      if (!isCancelled) {
        setIsInitialLoading(false);
      }
    };

    loadChunks();

    return () => {
      isCancelled = true;
    };
  }, [chunkIndices]);

  useEffect(() => {
    if (isInitialLoading && !loadingControlRef.current) {
      loadingControlRef.current = true;
      setLoading(true);
    } else if (!isInitialLoading && loadingControlRef.current) {
      loadingControlRef.current = false;
      setLoading(false);
    }

    return () => {
      if (loadingControlRef.current) {
        loadingControlRef.current = false;
        setLoading(false);
      }
    };
  }, [isInitialLoading, setLoading]);
  
  // データがない場合は何も表示しない
  if (chunkIndices.length === 0 || isInitialLoading) {
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
