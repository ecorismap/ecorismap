import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HOME_BTN, COLOR, HOME_FEATURE_BTN } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { Button, SelectionalButton } from '../atoms';

export const HomeButtons = React.memo(() => {
  //console.log('render HomeButtons');

  const { featureButton, trackingState, gotoMaps, gotoSettings, pressTracking, gotoLayers, selectFeatureButton } =
    useContext(HomeContext);

  const { isLandscape } = useWindow();

  return (
    <View style={isLandscape ? styles.buttonContainerLandscape : styles.buttonContainer}>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.MAPS} onPress={gotoMaps} backgroundColor={COLOR.BLUE} />
      </View>
      {Platform.OS !== 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={HOME_BTN.TRACK}
            backgroundColor={trackingState === 'on' ? 'red' : COLOR.BLUE}
            onPress={pressTracking}
          />
        </View>
      )}
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.LAYERS} backgroundColor={COLOR.BLUE} onPress={gotoLayers} borderRadius={50} />
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <SelectionalButton selectedButton={featureButton} directionRow="column">
          <Button
            id="POINT"
            name={HOME_FEATURE_BTN.POINT}
            onPressCustom={() => selectFeatureButton('POINT')}
            backgroundColor={COLOR.BLUE}
          />
          <Button
            id="LINE"
            name={HOME_FEATURE_BTN.LINE}
            onPressCustom={() => selectFeatureButton('LINE')}
            backgroundColor={COLOR.BLUE}
          />
          <Button
            id="POLYGON"
            name={HOME_FEATURE_BTN.POLYGON}
            onPressCustom={() => selectFeatureButton('POLYGON')}
            backgroundColor={COLOR.BLUE}
          />
          <Button
            id="MEMO"
            name={HOME_FEATURE_BTN.MEMO}
            onPressCustom={() => selectFeatureButton('MEMO')}
            backgroundColor={COLOR.BLUE}
          />
          <Button
            id="NONE"
            name={HOME_FEATURE_BTN.NONE}
            onPressCustom={() => selectFeatureButton('NONE')}
            backgroundColor={COLOR.BLUE}
          />
        </SelectionalButton>
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.SETTINGS} backgroundColor={COLOR.BLUE} onPress={gotoSettings} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    alignSelf: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 35,
    position: 'absolute',
    // zIndex: 0,
  },
  buttonContainerLandscape: {
    alignItems: 'flex-end',
    //alignSelf: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 20,
    position: 'absolute',
    width: '50%',
    // zIndex: 0,
  },
});
