import React from 'react';
import { ViewportBounds } from '../../utils/ViewportCulling';

// 軌跡上の写真表示は端末の写真ライブラリを照合するネイティブ専用機能。
// Webではライブラリが存在しないため何も表示しない
interface Props {
  bounds: ViewportBounds | null;
}

export const HomeTrackPhotoMarkers = React.memo((_props: Props) => null);
