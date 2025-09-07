import React from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { getDisplayBuffer } from '../../utils/Location';

interface Props {
  currentLocation: { latitude: number; longitude: number } | null;
}

// カスタム比較関数で不要な再レンダリングを防ぐ
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  // 現在位置が変更されたら再レンダリング
  if (
    prevProps.currentLocation?.latitude !== nextProps.currentLocation?.latitude ||
    prevProps.currentLocation?.longitude !== nextProps.currentLocation?.longitude
  ) {
    return false;
  }

  return true;
};

export const CurrentTrackLog = React.memo((props: Props) => {
  // props.currentLocationは再レンダリングのトリガーとして使用（arePropsEqualで比較）

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { currentLocation } = props;

  // 実際のデータはMMKVから直接取得
  const currentChunk = getDisplayBuffer();

  // データがない場合は何も表示しない
  if (!currentChunk || currentChunk.length === 0) {
    return null;
  }

  return (
    <Polyline
      key="current-track"
      tappable={false}
      coordinates={currentChunk}
      strokeColor={COLOR.TRACK}
      strokeWidth={4}
      lineCap="butt"
      zIndex={101}
    />
  );
}, arePropsEqual);
