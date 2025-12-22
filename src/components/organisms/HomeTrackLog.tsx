import React from 'react';

import { TrackMetadataType } from '../../types';
import { SavedTrackLog } from './SavedTrackLog';
import { CurrentTrackLog } from './CurrentTrackLog';

interface Props {
  metadata: TrackMetadataType;
}

// 親コンポーネント - メタデータに基づいて子コンポーネントをレンダリング
export const TrackLog = React.memo((props: Props) => {
  const { metadata } = props;

  // メタデータのチェック
  if (metadata === undefined) return null;

  return (
    <>
      {/* 保存済みチャンク（静的） - savedChunkCountが変わった時のみ再レンダリング */}
      <SavedTrackLog savedChunkCount={metadata.savedChunkCount} />

      {/* 現在記録中のチャンク（動的） - 現在地またはtotalPointsが変わった時に再レンダリング */}
      <CurrentTrackLog
        currentLocation={metadata.currentLocation || null}
        totalPoints={metadata.totalPoints}
      />
    </>
  );
});
