import React, { createContext, useCallback, useMemo, useState, ReactNode } from 'react';
import { TrackPhotoType } from '../types';

interface TrackPhotoContextType {
  // TrackSummary表示中に軌跡上へ表示する写真。非表示時は空（マーカーも消える）
  trackPhotos: TrackPhotoType[];
  setTrackPhotos: (photos: TrackPhotoType[]) => void;
  // タップで拡大表示中の写真。nullならモーダル非表示
  selectedPhoto: TrackPhotoType | null;
  setSelectedPhoto: (photo: TrackPhotoType | null) => void;
  // 引き出し線つきで展開中の写真グループ（クラスタ）のid。nullなら全て折りたたみ
  expandedClusterId: string | null;
  setExpandedClusterId: (id: string | null) => void;
}

export const TrackPhotoContext = createContext<TrackPhotoContextType>({
  trackPhotos: [],
  setTrackPhotos: () => {},
  selectedPhoto: null,
  setSelectedPhoto: () => {},
  expandedClusterId: null,
  setExpandedClusterId: () => {},
});

// TrackFocusProviderと同様、BottomSheet内のTrackSummary（投入側）と
// 地図側のマーカー・タップ判定（消費側）の両方から届く位置に置く専用Provider
export function TrackPhotoProvider({ children }: { children: ReactNode }) {
  const [trackPhotos, setTrackPhotosState] = useState<TrackPhotoType[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<TrackPhotoType | null>(null);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);

  // 写真リストが空になったら（サマリーを閉じた/別の軌跡を開いた）展開状態もリセットする。
  // 同じ軌跡を開き直したときに前回の展開が勝手に復元されるのを防ぐ
  const setTrackPhotos = useCallback((photos: TrackPhotoType[]) => {
    setTrackPhotosState(photos);
    if (photos.length === 0) setExpandedClusterId(null);
  }, []);

  const value = useMemo(
    () => ({ trackPhotos, setTrackPhotos, selectedPhoto, setSelectedPhoto, expandedClusterId, setExpandedClusterId }),
    [trackPhotos, setTrackPhotos, selectedPhoto, expandedClusterId]
  );

  return <TrackPhotoContext.Provider value={value}>{children}</TrackPhotoContext.Provider>;
}
