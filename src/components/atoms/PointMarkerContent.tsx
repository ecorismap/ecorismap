import React from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import PointView from './PointView';
import PointLabel from './PointLabel';
import type { LabelPlacement } from '../../utils/pointLabelGroups';

interface Props {
  label: string;
  /** ラベルの置き場所。undefinedならラベルを描かない */
  placement: LabelPlacement | undefined;
  size: number;
  color: string;
  pointColor: string;
  borderColor: string;
  labelBorderColor: string;
}

/** 推定より太い文字がはみ出さないための余白[px]。横は長さに比例して広げる */
const PAD_X_BASE = 12;
const PAD_X_RATIO = 0.1;
const PAD_Y = 4;

/**
 * iOSのGoogle Maps SDKは、マーカー画像の辺が1024pxを超えると何も描かない（実測: 1002pxは描かれ
 * 1035pxは消える）。3倍解像度では341pt。余裕を見てこの値に収める
 */
const MAX_MARKER_ICON_PX = 1000;

export interface MarkerContentLayout {
  width: number;
  height: number;
  /** 記号中心のコンテナ内座標 */
  cx: number;
  cy: number;
  /** ラベル箱の左上（コンテナ内座標）と幅 */
  labelLeft: number;
  labelTop: number;
  labelBoxWidth: number;
}

const labelBoxWidthOf = (placement: LabelPlacement) => placement.width + PAD_X_BASE + placement.width * PAD_X_RATIO;

/**
 * 記号＋ラベル＋引き出し線の外接矩形を求める。
 * 以前は記号中心がコンテナ中心に来る左右対称の箱にしていたが、ラベルの反対側が丸ごと無駄になり
 * 引き出し線付きでMAX_MARKER_ICON_PXを超えてマーカーごと消えたため、必要な範囲だけにして
 * 記号の位置はanchor（cx/width, cy/height）で地図側に伝える
 */
export const getMarkerContentLayout = (placement: LabelPlacement | undefined, size: number): MarkerContentLayout => {
  const half = size / 2;
  let xMin = -half - PAD_X_BASE;
  let xMax = half + PAD_X_BASE;
  let yMin = -half - PAD_Y;
  let yMax = half + PAD_Y;
  let boxLeft = 0;
  let boxTop = 0;
  let labelBoxWidth = 0;
  if (placement) {
    labelBoxWidth = labelBoxWidthOf(placement);
    // 付け根側の端を固定し、推定より長い文字は反対側へ伸びる（余白はその側だけ）
    if (placement.dx > 0) boxLeft = placement.dx - placement.width / 2;
    else if (placement.dx < 0) boxLeft = placement.dx + placement.width / 2 - labelBoxWidth;
    else boxLeft = -labelBoxWidth / 2;
    boxTop = placement.dy - placement.height / 2;
    xMin = Math.min(xMin, boxLeft);
    xMax = Math.max(xMax, boxLeft + labelBoxWidth);
    yMin = Math.min(yMin, boxTop - PAD_Y);
    yMax = Math.max(yMax, boxTop + placement.height + PAD_Y);
  }
  return {
    width: xMax - xMin,
    height: yMax - yMin,
    cx: -xMin,
    cy: -yMin,
    labelLeft: boxLeft - xMin,
    labelTop: boxTop - yMin,
    labelBoxWidth,
  };
};

/**
 * ラベル幅の上限[pt]。最も幅を取る「右（左）への引き出し線＋ラベル」のコンテナが
 * MAX_MARKER_ICON_PXに収まる幅。Webは制限なし（DOM描画）
 */
export const getMaxLabelWidth = (pointSize: number, maxLeaderRadius: number): number | undefined => {
  if (Platform.OS === 'web') return undefined;
  const maxPt = MAX_MARKER_ICON_PX / PixelRatio.get();
  // width = (half + PAD_X_BASE) + maxLeaderRadius + labelBoxWidth = half + 2*PAD_X_BASE + radius + (1+PAD_X_RATIO)*L
  return Math.floor((maxPt - pointSize / 2 - 2 * PAD_X_BASE - maxLeaderRadius) / (1 + PAD_X_RATIO));
};

/**
 * 記号＋ラベル＋引き出し線を描く。コンテナの大きさはgetMarkerContentLayoutで明示し、
 * 地図側はそのcx/cyをanchorにして記号中心を座標に乗せる。
 * ネイティブ(react-native-maps)のAndroidはこのViewをビットマップに切り出すため、
 * ラベルがコンテナからはみ出すと欠ける。余白PAD_X/PAD_Yはそのため。
 * ラベルは1行固定で、箱に収まらない分は末尾を…で省略する（折り返すと記号の位置計算が崩れる）
 */
export const PointMarkerContent = React.memo((props: Props) => {
  const { label, placement, size, color, pointColor, borderColor, labelBorderColor } = props;
  const half = size / 2;
  const { width, height, cx, cy, labelLeft, labelTop, labelBoxWidth } = getMarkerContentLayout(placement, size);

  let labelNode: React.ReactNode = null;
  if (placement) {
    const align = placement.dx > 0 ? 'left' : placement.dx < 0 ? 'right' : 'center';
    const alignItems = placement.dx > 0 ? 'flex-start' : placement.dx < 0 ? 'flex-end' : 'center';
    labelNode = (
      <View style={{ position: 'absolute', top: labelTop, left: labelLeft, width: labelBoxWidth, alignItems }}>
        <PointLabel label={label} size={size} color={color} borderColor={labelBorderColor} align={align} singleLine />
      </View>
    );
  }

  let leaderNode: React.ReactNode = null;
  if (placement?.leader) {
    const { angle, length } = placement.leader;
    // 記号の縁から付け根までの線分。中心で回転させるので transformOrigin は不要
    const midX = cx + (half + length / 2) * Math.cos(angle);
    const midY = cy + (half + length / 2) * Math.sin(angle);
    const rotate = `${angle}rad`;
    leaderNode = (
      <>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: midX - length / 2,
            top: midY - 1.5,
            width: length,
            height: 3,
            backgroundColor: labelBorderColor,
            transform: [{ rotate }],
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: midX - length / 2,
            top: midY - 0.5,
            width: length,
            height: 1,
            backgroundColor: color,
            transform: [{ rotate }],
          }}
        />
      </>
    );
  }

  return (
    <View style={{ width, height }} collapsable={false} pointerEvents="box-none">
      {leaderNode}
      {labelNode}
      <PointView
        size={size}
        color={pointColor}
        borderColor={borderColor}
        style={{ position: 'absolute', left: cx - half, top: cy - half }}
      />
    </View>
  );
});

export default PointMarkerContent;
