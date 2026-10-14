import React from 'react';
import { Platform, Text } from 'react-native';

interface Props {
  label: string;
  size: number;
  color: string;
  borderColor: string;
  align?: 'left' | 'center' | 'right';
  /** この文字数ごとに改行する。省略時は改行しない */
  maxCharsPerLine?: number;
  /** 1行固定にし、親の幅に収まらない分は末尾を…で省略する */
  singleLine?: boolean;
}

/** 行の高さ。pointLabelGroupsの矩形推定(lineHeight)と一致させる */
export const POINT_LABEL_LINE_HEIGHT_RATIO = 1.2;

// 指定文字数ごとに改行を入れるヘルパー関数
const formatLabel = (label: string, maxCharsPerLine: number | undefined): string => {
  if (!maxCharsPerLine) return label;
  let formatted = '';
  for (let i = 0; i < label.length; i += maxCharsPerLine) {
    // 最大10文字ずつ切り出して改行を挿入する
    formatted += label.slice(i, i + maxCharsPerLine);
    if (i + maxCharsPerLine < label.length) {
      formatted += '\n';
    }
  }
  return formatted;
};

const PointLabel = React.memo((props: Props) => {
  const { label, size, color, borderColor, align, maxCharsPerLine, singleLine } = props;
  const formattedLabel = formatLabel(label, maxCharsPerLine);
  const shadowStyle =
    Platform.OS === 'web'
      ? { textShadow: `1px 1px 1px ${borderColor}` }
      : {
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 1,
          textShadowColor: borderColor,
        };
  return (
    <Text
      numberOfLines={singleLine ? 1 : undefined}
      ellipsizeMode={singleLine ? 'tail' : undefined}
      style={{
        fontSize: size,
        lineHeight: size * POINT_LABEL_LINE_HEIGHT_RATIO,
        color,
        textAlign: align,
        ...shadowStyle,
      }}
    >
      {formattedLabel}
    </Text>
  );
});

export default PointLabel;
