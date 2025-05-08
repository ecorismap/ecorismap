import React from 'react';
import { Platform, Text } from 'react-native';

interface Props {
  label: string;
  size: number;
  color: string;
  borderColor: string;
}

// 15文字ごとに改行を入れるヘルパー関数
const formatLabel = (label: string, maxCharsPerLine: number = 15): string => {
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
  const { label, size, color, borderColor } = props;
  const formattedLabel = formatLabel(label);
  const shadowStyle =
    Platform.OS === 'web'
      ? { textShadow: `1px 1px 1px ${borderColor}` }
      : {
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 1,
          textShadowColor: borderColor,
        };
  return <Text style={{ fontSize: size, color, ...shadowStyle }}>{formattedLabel}</Text>;
});

export default PointLabel;
