import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  zoom: number;
  top: number;
  left: number;
}

export const HomeZoomLevel = React.memo((props: Props) => {
  //console.log('render ZoomButton');
  const { zoom, top, left } = props;

  const styles = StyleSheet.create({
    buttonContainer: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY2,
      borderRadius: 5,
      borderWidth: 1,
      elevation: 100,
      height: 30,
      justifyContent: 'center',
      left: left,
      position: 'absolute',
      top: top,
      width: 30,
      zIndex: 100,
    },
  });

  return (
    <View style={styles.buttonContainer}>
      <Text style={{ fontSize: 12, color: COLOR.BLACK }}>{zoom.toString()}</Text>
    </View>
  );
});
