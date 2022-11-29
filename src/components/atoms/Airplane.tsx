import React from 'react';
import Svg, { Path } from 'react-native-svg';
export default function Airplane(props: any) {
  return (
    <Svg width={30} height={31} viewBox="0 0 305 313" {...props}>
      <Path d="M134.875 19.74c.04-22.771 34.363-22.771 34.34.642v95.563L303 196.354v35.306l-133.144-43.821v71.424l30.813 24.072v27.923l-47.501-14.764-47.501 14.764v-27.923l30.491-24.072v-71.424L3 231.66v-35.306l131.875-80.409V19.74z" />
    </Svg>
  );
}
