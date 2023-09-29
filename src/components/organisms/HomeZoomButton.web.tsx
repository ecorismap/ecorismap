import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';

interface Props {
  zoom: number;
  top: number;
  left: number;
  zoomIn: () => void;
  zoomOut: () => void;
}

export const HomeZoomButton = React.memo((props: Props) => {
  //console.log('render ZoomButton');
  const { top, left, zoomIn, zoomOut } = props;

  const styles = StyleSheet.create({
    buttonContainer: {
      alignItems: 'center',
      //backgroundColor: COLOR.ALFABLUE2,
      borderRadius: 10,
      //elevation: 100,
      height: 50,
      justifyContent: 'space-between',
      left: left,
      position: 'absolute',
      top: top,
      width: 36,
      //zIndex: 100,
    },
  });

  return (
    <View style={styles.buttonContainer}>
      <MaterialCommunityIcons.Button
        //@ts-ignore
        color={COLOR.BLACK}
        backgroundColor={COLOR.WHITE}
        borderRadius={5}
        //style={{ borderColor: COLOR.GRAY0, borderWidth: 1 }}
        iconStyle={{ marginRight: 0 }}
        size={12}
        name={HOME_BTN.ZOOM_PLUS}
        onPress={zoomIn}
      />
      <MaterialCommunityIcons.Button
        //@ts-ignore
        color={COLOR.BLACK}
        backgroundColor={COLOR.WHITE}
        borderRadius={2}
        //style={{ borderColor: COLOR.GRAY0, borderWidth: 1 }}
        iconStyle={{ marginRight: 0 }}
        size={12}
        name={HOME_BTN.ZOOM_MINUS}
        onPress={zoomOut}
      />
    </View>
  );
});
