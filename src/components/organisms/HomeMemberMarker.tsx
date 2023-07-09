import React from 'react';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { MemberLocationType } from '../../types';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  memberLocation: MemberLocationType;
}

export const MemberMarker = (props: Props) => {
  const { memberLocation } = props;

  //console.log(angle);

  return (
    <Marker
      coordinate={{
        latitude: memberLocation.coords.latitude,
        longitude: memberLocation.coords.longitude,
      }}
      opacity={0.9}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={true}
    >
      {memberLocation.icon.photoURL !== null ? (
        //@ts-ignore
        <TouchableOpacity name="account" onPress={() => null}>
          <Image style={styles.icon} source={{ uri: memberLocation.icon.photoURL }} />
        </TouchableOpacity>
      ) : (
        //@ts-ignore
        <TouchableOpacity name="account" onPress={() => null}>
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
        </TouchableOpacity>
      )}
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
