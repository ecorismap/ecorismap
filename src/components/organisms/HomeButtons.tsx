import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HOME_BTN, COLOR, HOME_FEATURE_BTN } from '../../constants/AppConstants';
import { FeatureButtonType, TrackingStateType } from '../../types';
import { Button, SelectionalButton } from '../atoms';

interface Props {
  featureButton: FeatureButtonType;
  trackingState: TrackingStateType;
  showMap: () => void;
  showSettings: () => void;
  onPressTracking: () => void;
  showLayer: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
}
export const HomeButtons = React.memo((props: Props) => {
  //console.log('render HomeButtons');
  const { featureButton, trackingState, showMap, showSettings, onPressTracking, showLayer, selectFeatureButton } =
    props;
  //console.log('HomeButton');
  return (
    <View style={styles.buttonContainer}>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.MAPS} onPress={showMap} />
      </View>
      {Platform.OS !== 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={HOME_BTN.TRACK}
            backgroundColor={trackingState === 'on' ? 'red' : COLOR.BLUE}
            onPress={onPressTracking}
          />
        </View>
      )}
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.LAYERS} backgroundColor={COLOR.BLUE} onPress={showLayer} borderRadius={50} />
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <SelectionalButton selectedButton={featureButton} directionRow="column">
          <Button id="POINT" name={HOME_FEATURE_BTN.POINT} onPressCustom={() => selectFeatureButton('POINT')} />
          <Button id="LINE" name={HOME_FEATURE_BTN.LINE} onPressCustom={() => selectFeatureButton('LINE')} />
          <Button id="NONE" name={HOME_FEATURE_BTN.NONE} onPressCustom={() => selectFeatureButton('NONE')} />
        </SelectionalButton>
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={HOME_BTN.SETTINGS} backgroundColor={COLOR.BLUE} onPress={showSettings} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 35,
    zIndex: 100,
  },
});
