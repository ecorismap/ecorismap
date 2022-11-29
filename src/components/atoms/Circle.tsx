import React from 'react';
import Svg, { Path } from 'react-native-svg';
export default function Circle(props: any) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" {...props}>
      <Path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0 1A5 5 0 1 0 8 3a5 5 0 0 0 0 10z" />
      <Path d="M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
    </Svg>
  );
}
