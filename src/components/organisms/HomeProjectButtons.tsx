import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { HomeContext } from '../../contexts/Home';
import { Button } from '../atoms';

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
            <Button name={'content-save-cog'} onPress={pressSaveProjectSetting} backgroundColor={COLOR.BLUE} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name={'close-octagon'} onPress={pressDiscardProjectSetting} backgroundColor={COLOR.DARKRED} />
          </View>
        </>
      ) : (
        <>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="home" onPress={() => pressJumpProject()} borderRadius={50} backgroundColor={COLOR.BLUE} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="cloud-download" onPress={pressDownloadData} borderRadius={50} backgroundColor={COLOR.BLUE} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="cloud-upload" backgroundColor={COLOR.BLUE} onPress={pressUploadData} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="podcast" backgroundColor={isSynced ? COLOR.RED : COLOR.BLUE} onPress={pressSyncPosition} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="logout" backgroundColor={COLOR.BLUE} disabled={false} onPress={pressCloseProject} />
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
    top: Platform.OS === 'ios' ? 80 : 50,
    zIndex: 100,
  },
});
