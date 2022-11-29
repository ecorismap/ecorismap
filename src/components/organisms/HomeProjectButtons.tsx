import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  isSettingProject: boolean;
  isSynced: boolean;
  onPressSyncPosition: () => void;
  onPressJumpProject: () => void;
  onPressUploadData: () => void;
  onPressDownloadData: () => void;
  onPressCloseProject: () => void;
  onPressSaveProjectSetting: () => void;
  onPressDiscardProjectSetting: () => void;
}
export const HomeProjectButtons = React.memo((props: Props) => {
  //console.log('render HomeButtons');
  const {
    isSettingProject,
    isSynced,
    onPressSyncPosition,
    onPressJumpProject,
    onPressUploadData,
    onPressDownloadData,
    onPressCloseProject,
    onPressSaveProjectSetting,
    onPressDiscardProjectSetting,
  } = props;
  //console.log('HomeButton');
  return (
    <View style={styles.buttonContainer}>
      {isSettingProject ? (
        <>
          <View style={{ marginHorizontal: 9 }}>
            <Button name={'content-save-cog'} onPress={onPressSaveProjectSetting} backgroundColor={COLOR.BLUE} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name={'close-octagon'} onPress={onPressDiscardProjectSetting} backgroundColor={COLOR.DARKRED} />
          </View>
        </>
      ) : (
        <>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="home" onPress={() => onPressJumpProject()} borderRadius={50} backgroundColor={COLOR.BLUE} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button
              name="cloud-download"
              onPress={onPressDownloadData}
              borderRadius={50}
              backgroundColor={COLOR.BLUE}
            />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="cloud-upload" backgroundColor={COLOR.BLUE} onPress={onPressUploadData} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="podcast" backgroundColor={isSynced ? COLOR.RED : COLOR.BLUE} onPress={onPressSyncPosition} />
          </View>
          <View style={{ marginHorizontal: 9 }}>
            <Button name="logout" backgroundColor={COLOR.BLUE} disabled={false} onPress={onPressCloseProject} />
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
