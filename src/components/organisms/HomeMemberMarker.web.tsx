import React from 'react';
import { Pressable, View, Image, StyleSheet, Text } from 'react-native';
import { MemberLocationType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  memberLocation: MemberLocationType;
}

export const MemberMarker = (props: Props) => {
  const { memberLocation } = props;

  //console.log(angle);

  return (
    <Marker {...memberLocation.coords} offset={[-24 / 2, -15.72 / 2]} anchor={'top-left'}>
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
};

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
