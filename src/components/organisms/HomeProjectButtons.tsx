import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR } from '../../constants/AppConstants';
import { ProjectContext } from '../../contexts/Project';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const HomeProjectButtons = React.memo(() => {
  //console.log('render HomeButtons');
  const {
    isSettingProject,
    //isSynced,
    pressJumpProject,
    pressDownloadData,
    pressUploadData,
    //pressSyncPosition,
    pressCloseProject,
    pressSaveProjectSetting,
    pressDiscardProjectSetting,
  } = useContext(ProjectContext);
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    buttonContainer: {
      alignSelf: 'center',
      flexDirection: 'row',
      position: 'absolute',
      top: insets.top + 60,
      zIndex: 100,
    },
  });

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
              labelText={t('Home.label.saveProject')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name={'close-octagon'}
              onPress={pressDiscardProjectSetting}
              backgroundColor={COLOR.DARKRED}
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
              backgroundColor={COLOR.DARKGREEN}
              labelText={t('Home.label.jumpProject')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="cloud-download"
              onPress={pressDownloadData}
              borderRadius={50}
              backgroundColor={COLOR.DARKBLUE}
              labelText={t('Home.label.downloadData')}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="cloud-upload"
              color={COLOR.GRAY4}
              backgroundColor={COLOR.DARKYELLOW}
              onPress={pressUploadData}
              labelText={t('Home.label.uploadData')}
              labelTextColor={COLOR.GRAY4}
            />
          </View>
          {/* <View style={{ marginHorizontal: 9 }}>
            <Button
              name="podcast"
              backgroundColor={isSynced ? COLOR.RED : COLOR.BLUE}
              onPress={pressSyncPosition}
              labelText={t('Home.label.syncPosition')}
            />
          </View> */}
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="exit-run"
              backgroundColor={COLOR.DARKRED}
              disabled={false}
              onPress={pressCloseProject}
              labelText={t('Home.label.closeProject')}
            />
          </View>
        </>
      )}
    </View>
  );
});
