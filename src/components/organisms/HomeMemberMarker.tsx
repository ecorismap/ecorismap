import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { Marker } from 'react-native-maps';
import { MemberLocationType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';

interface Props {
  memberLocation: MemberLocationType;
}

export const MemberMarker = React.memo((props: Props) => {
  const { memberLocation } = props;
  const photoURL = memberLocation.icon.photoURL;

  // tracksViewChangesは基本false（trueだとiOSで毎フレーム再描画され、重なりの点滅と電池消費の原因）。
  // ただし写真アイコンは非同期読み込みのため、iOSでは読み込み完了までtrueにして反映し、
  // 完了後にfalseへ戻す（falseのままだと読み込み前の空アイコンで固定される）
  const [tracksChanges, setTracksChanges] = useState(Platform.OS === 'ios' && photoURL !== null);
  useEffect(() => {
    setTracksChanges(Platform.OS === 'ios' && photoURL !== null);
  }, [photoURL]);

  return (
    <Marker
      key={`member-${photoURL ?? memberLocation.icon.initial}`}
      coordinate={{
        latitude: memberLocation.coords.latitude,
        longitude: memberLocation.coords.longitude,
      }}
      opacity={0.9}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksChanges}
      // 同一zIndexのマーカーは重なると描画順が不定で点滅するため、uidハッシュで一意にする
      zIndex={Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.MEMBER, memberLocation.uid) : undefined}
    >
      {photoURL !== null ? (
        //@ts-ignore
        <Pressable name="account" onPress={() => null}>
          <Image
            style={styles.icon}
            source={{ uri: photoURL }}
            onLoadEnd={() => setTracksChanges(false)}
            onError={() => setTracksChanges(false)}
          />
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
