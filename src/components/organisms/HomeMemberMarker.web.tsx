import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MemberLocationType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';
import type { Marker as MaplibreMarker } from 'maplibre-gl';
import { useHideMarkersBehindCamera } from '../../hooks/useHideMarkersBehindCamera';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  memberLocation: MemberLocationType;
}

export const MemberMarker = React.memo((props: Props) => {
  const { memberLocation } = props;
  // 傾けた3D・眺望で、カメラの後ろのメンバーが前方の空に浮かないようにする
  const markerRef = useRef<MaplibreMarker | null>(null);
  const refreshVisibility = useHideMarkersBehindCamera(() => [markerRef.current]);
  // 位置の更新はマーカーを動かすだけで地図の描画イベントが来ないので、動いたら判定し直す
  const { latitude, longitude } = memberLocation.coords;
  useEffect(() => refreshVisibility(), [latitude, longitude, refreshVisibility]);

  //console.log(angle);

  return (
    <Marker ref={markerRef} {...memberLocation.coords} anchor={'center'}>
      <div>
        {memberLocation.icon.photoURL !== null ? (
          //@ts-ignore
          <Pressable name="account" onPress={() => null}>
            <Image style={styles.icon} source={{ uri: memberLocation.icon.photoURL }} />
          </Pressable>
        ) : (
          //@ts-ignore
          <Pressable name="account" onPress={() => null}>
            <View
              style={{
                width: 35,
                height: 35,
                borderRadius: 35,
                backgroundColor: COLOR.ORANGE,
                //flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={styles.textIcon}>{memberLocation.icon.initial}</Text>
            </View>
          </Pressable>
        )}
      </div>
    </Marker>
  );
});

const styles = StyleSheet.create({
  icon: {
    borderRadius: 50,
    height: 35,
    marginBottom: 5,
    width: 35,
  },
  textIcon: {
    color: COLOR.WHITE,
    fontSize: 20,
    fontWeight: 'bold',
  },
});
