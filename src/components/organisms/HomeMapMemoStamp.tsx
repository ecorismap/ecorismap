import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { LayerType, PointRecordType, RecordType } from '../../types';
import Svg, { Circle, Line, Polygon, Rect, Text } from 'react-native-svg';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  feature: PointRecordType;
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const HomeMapMemoStamp = React.memo((props: Props) => {
  //console.log('render Point');

  const { feature, selectedRecord } = props;
  //console.log('feature', feature);

  const selected = useMemo(
    () => feature.id === selectedRecord?.record?.id || feature.field._group === selectedRecord?.record.id,
    [feature.field._group, feature.id, selectedRecord?.record.id]
  );
  const color = useMemo(
    () => (selected ? COLOR.YELLOW : (feature.field._strokeColor as string)),
    [feature.field._strokeColor, selected]
  );
  const stamp = useMemo(() => feature.field._stamp as string, [feature.field]);

  switch (stamp) {
    case 'NUMBERS':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                1
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'ALPHABETS':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                A
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TEXT':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 80, height: 20 }}>
            <Svg height="20" width="80" viewBox="0 0 80 20">
              <Text x="40" y="15" fontSize="12" fontWeight="bold" fill="black" textAnchor="middle">
                クマタカ
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TOMARI':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              {/* {selected && (
                <Rect x="0" y="0" width="20" height="20" stroke={COLOR.ORANGE} strokeWidth="4" fill="none" />
              )} */}
              <Circle cx="10" cy="10" r="4" stroke={'#ffffffaa'} strokeWidth="1" fill={color} />
            </Svg>
          </View>
        </Marker>
      );
    case 'KARI':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Line x1="6" y1="6" x2="14" y2="14" stroke={color} strokeWidth="2" />
              <Line x1="14" y1="6" x2="6" y2="14" stroke={color} strokeWidth="2" />
            </Svg>
          </View>
        </Marker>
      );
    case 'HOVERING':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1" fill="#ffffffaa" />
              <Text x="10" y="14" fontSize="12" fontWeight="bold" fill={color} textAnchor="middle">
                H
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'SQUARE':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Rect x="4" y="4" width="12" height="12" stroke={color} strokeWidth="2" fill={color} />
            </Svg>
          </View>
        </Marker>
      );
    case 'CIRCLE':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="6" stroke={color} strokeWidth="3" fill={color} />
            </Svg>
          </View>
        </Marker>
      );
    case 'TRIANGLE':
      return (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Polygon points="10,3.68 2,18 18,18" stroke={color} strokeWidth="0" fill={color} />
            </Svg>
          </View>
        </Marker>
      );
    default:
      return null;
  }
});
