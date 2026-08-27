import React, { createContext, useMemo, useState, ReactNode } from 'react';
import { TrackPhotoType } from '../types';

interface TrackPhotoContextType {
  // TrackSummary表示中に軌跡上へ表示する写真。非表示時は空（マーカーも消える）
  trackPhotos: TrackPhotoType[];
  setTrackPhotos: (photos: TrackPhotoType[]) => void;
  // タップで拡大表示中の写真。nullならモーダル非表示
  selectedPhoto: TrackPhotoType | null;
  setSelectedPhoto: (photo: TrackPhotoType | null) => void;
}

export const TrackPhotoContext = createContext<TrackPhotoContextType>({
  trackPhotos: [],
  setTrackPhotos: () => {},
  selectedPhoto: null,
  setSelectedPhoto: () => {},
});

// TrackFocusProviderと同様、BottomSheet内のTrackSummary（投入側）と
// 地図側のマーカー・タップ判定（消費側）の両方から届く位置に置く専用Provider
export function TrackPhotoProvider({ children }: { children: ReactNode }) {
  const [trackPhotos, setTrackPhotos] = useState<TrackPhotoType[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<TrackPhotoType | null>(null);

  const value = useMemo(
    () => ({ trackPhotos, setTrackPhotos, selectedPhoto, setSelectedPhoto }),
    [trackPhotos, selectedPhoto]
  );

  return <TrackPhotoContext.Provider value={value}>{children}</TrackPhotoContext.Provider>;
}
