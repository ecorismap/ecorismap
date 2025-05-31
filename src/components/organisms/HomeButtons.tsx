import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HOME_BTN, COLOR, HOME_FEATURE_BTN } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { AppStateContext } from '../../contexts/AppState';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { Button, SelectionalButton } from '../atoms';
import { t } from '../../i18n/config';

export const HomeButtons = React.memo(() => {
  //console.log('render HomeButtons');

  const { gotoMaps, gotoSettings, gotoLayers } = useContext(AppStateContext);
  const { featureButton, selectFeatureButton } = useContext(DrawingToolsContext);
  const { trackingState, pressTracking } = useContext(LocationTrackingContext);

  const { isLandscape } = useWindow();

  return (
    <View style={isLandscape ? styles.buttonContainerLandscape : styles.buttonContainer}>
      <View style={{ marginHorizontal: 9 }}>
        <Button
          name={HOME_BTN.MAPS}
          onPress={gotoMaps}
          backgroundColor={COLOR.BLUE}
          tooltipText={t('Maps.navigation.title')}
          labelText={t('Home.label.maps')}
        />
      </View>
      {Platform.OS !== 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={HOME_BTN.TRACK}
            backgroundColor={trackingState === 'on' ? 'red' : COLOR.BLUE}
            onPress={pressTracking}
            labelText={t('Home.label.track')}
          />
        </View>
      )}
      <View style={{ marginHorizontal: 9 }}>
        <Button
          name={HOME_BTN.LAYERS}
          backgroundColor={COLOR.BLUE}
          onPress={gotoLayers}
          borderRadius={50}
          tooltipText={t('Layers.navigation.title')}
          labelText={t('Home.label.layers')}
        />
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <SelectionalButton selectedButton={featureButton} direction="bottomToUp">
          <Button
            id="POINT"
            name={HOME_FEATURE_BTN.POINT}
            onPressCustom={() => selectFeatureButton('POINT')}
            backgroundColor={COLOR.BLUE}
            tooltipText={t('common.point')}
            labelText={t('Home.label.point')}
            labelFontSize={7}
          />
          <Button
            id="LINE"
            name={HOME_FEATURE_BTN.LINE}
            onPressCustom={() => selectFeatureButton('LINE')}
            backgroundColor={COLOR.BLUE}
            tooltipText={t('common.line')}
            labelText={t('Home.label.line')}
          />
          <Button
            id="POLYGON"
            name={HOME_FEATURE_BTN.POLYGON}
            onPressCustom={() => selectFeatureButton('POLYGON')}
            backgroundColor={COLOR.BLUE}
            tooltipText={t('common.polygon')}
            labelText={t('Home.label.polygon')}
            labelFontSize={7}
          />
          <Button
            id="MEMO"
            name={HOME_FEATURE_BTN.MEMO}
            onPressCustom={() => selectFeatureButton('MEMO')}
            backgroundColor={COLOR.BLUE}
            tooltipText={t('common.memo')}
            labelText={t('Home.label.memo')}
          />
          <Button
            id="NONE"
            name={HOME_FEATURE_BTN.NONE}
            onPressCustom={() => selectFeatureButton('NONE')}
            backgroundColor={COLOR.BLUE}
            tooltipText={t('common.drawtool')}
            labelText={t('Home.label.drawtool')}
          />
        </SelectionalButton>
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <Button
          name={HOME_BTN.SETTINGS}
          backgroundColor={COLOR.BLUE}
          onPress={gotoSettings}
          tooltipText={t('Settings.navigation.title')}
          labelText={t('Home.label.settings')}
        />
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
