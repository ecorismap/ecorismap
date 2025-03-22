import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { HomeContext } from '../../contexts/Home';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const HomeProjectButtons = React.memo(() => {
  //console.log('render HomeButtons');
  const {
    isSettingProject,
    isSynced,
    pressJumpProject,
    pressDownloadData,
    pressUploadData,
    pressSyncPosition,
    pressCloseProject,
    pressSaveProjectSetting,
    pressDiscardProjectSetting,
  } = useContext(HomeContext);
  //console.log('HomeButton');
  return (
    <View style={styles.buttonContainer}>
      {isSettingProject ? (
        <>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name={'content-save-cog'}
              onPress={pressSaveProjectSetting}
              backgroundColor={COLOR.BLUE}
              tooltipText={t('Home.tooltip.saveProject')}
              labelText={t('Home.label.saveProject')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name={'close-octagon'}
              onPress={pressDiscardProjectSetting}
              backgroundColor={COLOR.DARKRED}
              tooltipText={t('Home.tooltip.discardProect')}
              labelText={t('Home.label.discardProject')}
            />
          </View>
        </>
      ) : (
        <>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="home"
              onPress={() => pressJumpProject()}
              borderRadius={50}
              backgroundColor={COLOR.BLUE}
              tooltipText={t('Home.tooltip.jumpProject')}
              labelText={t('Home.label.jumpProject')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="cloud-download"
              onPress={pressDownloadData}
              borderRadius={50}
              backgroundColor={COLOR.BLUE}
              tooltipText={t('Home.tooltip.downloadData')}
              labelText={t('Home.label.downloadData')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="cloud-upload"
              backgroundColor={COLOR.BLUE}
              onPress={pressUploadData}
              tooltipText={t('Home.tooltip.uploadData')}
              labelText={t('Home.label.uploadData')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="podcast"
              backgroundColor={isSynced ? COLOR.RED : COLOR.BLUE}
              onPress={pressSyncPosition}
              tooltipText={t('Home.tooltip.syncPosition')}
              labelText={t('Home.label.syncPosition')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="close-thick"
              backgroundColor={COLOR.BLUE}
              disabled={false}
              onPress={pressCloseProject}
              tooltipText={t('Home.tooltip.closeProject')}
              labelText={t('Home.label.closeProject')}
            />
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    position: 'absolute',
    top: Platform.OS === 'ios' ? 82 : 60,
    zIndex: 100,
  },
});
