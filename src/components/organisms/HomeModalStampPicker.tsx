import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { COLOR, PLUGIN, STAMP } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { MapMemoToolType } from '../../types';
import Button from '../atoms/Button';
import { CheckBox } from '../molecules/CheckBox';
import { Pressable } from '../atoms/Pressable';

interface Props {
  currentMapMemoTool: MapMemoToolType;
  snapWithLine: boolean;
  modalVisible: boolean;

  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
  selectMapMemoSnapWithLine: (snapWithLine: boolean) => void;
  setVisibleMapMemoStamp: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalStampPicker = React.memo((props: Props) => {
  const {
    currentMapMemoTool,
    snapWithLine,
    modalVisible,
    selectMapMemoTool,
    setVisibleMapMemoStamp,
    selectMapMemoSnapWithLine,
  } = props;
  const [snapped, setSnapped] = useState(false);

  useEffect(() => {
    setSnapped(snapWithLine);
  }, [currentMapMemoTool, snapWithLine]);

  const handleStampPress = (tool: MapMemoToolType) => {
    selectMapMemoTool(tool);
    selectMapMemoSnapWithLine(snapped);
    setVisibleMapMemoStamp(false);
  };

  const styles = StyleSheet.create({
    checkbox: {
      flexDirection: 'column',
      height: 45,
      margin: 2,
      width: 180,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      marginHorizontal: 5,
      padding: 10,
      width: 80,
    },
    modalSubTitle: {
      fontSize: 14,
      margin: 5,
      textAlign: 'left',
    },
    modalTitle: {
      fontSize: 20,
      textAlign: 'center',
    },
    panelBrightnessContainer: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      marginBottom: 20,
      marginTop: 15,
    },
    shadow: {
      elevation: 5,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    swatchStyle: {
      borderRadius: 5,
      height: 18,
      width: 18,
    },
    closeButton: {
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 1,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonText: {
      fontSize: 24,
      color: COLOR.GRAY2,
    },
  });
  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <Pressable
        style={styles.modalCenteredView}
        onPress={() => {
          selectMapMemoTool(undefined);
          setVisibleMapMemoStamp(false);
        }}
        disablePressedAnimation
      >
        <Pressable
          style={styles.modalFrameView}
          onPress={() => {}} // モーダル本体は閉じない
          disablePressedAnimation
        >
          {/* バツボタン追加 */}
          <Pressable
            style={styles.closeButton}
            onPress={() => {
              selectMapMemoTool(undefined);
              setVisibleMapMemoStamp(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: PLUGIN.HISYOUTOOL ? 320 : 200 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectStamp')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10, width: 260 }}>
              {PLUGIN.HISYOUTOOL && (
                <View
                  style={{
                    flexDirection: 'column',
                    margin: 10,
                    borderWidth: 1,
                    borderRadius: 5,
                    padding: 10,
                    borderColor: COLOR.GRAY3,
                  }}
                >
                  <Text style={styles.modalSubTitle}>{`飛翔図`} </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'TOMARI'}
                        name={STAMP.TOMARI}
                        backgroundColor={currentMapMemoTool === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleStampPress('TOMARI')}
                        labelText="とまり"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'KARI'}
                        name={STAMP.KARI}
                        backgroundColor={currentMapMemoTool === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleStampPress('KARI')}
                        labelText="狩り"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'KOUBI'}
                        name={STAMP.KOUBI}
                        backgroundColor={currentMapMemoTool === 'KOUBI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleStampPress('KOUBI')}
                        labelText="交尾"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'VOICE'}
                        name={STAMP.VOICE}
                        backgroundColor={currentMapMemoTool === 'VOICE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleStampPress('VOICE')}
                        labelText="声のみ"
                        size={22}
                      />
                    </View>
                  </View>
                </View>
              )}
              <View
                style={{
                  flexDirection: 'column',
                  margin: 10,
                  borderWidth: 1,
                  borderRadius: 5,
                  padding: 10,
                  borderColor: COLOR.GRAY3,
                }}
              >
                <Text style={styles.modalSubTitle}>{`${t('common.common')}`} </Text>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ margin: 5 }}>
                    <Button
                      id={'CIRCLE'}
                      name={STAMP.CIRCLE}
                      backgroundColor={currentMapMemoTool === 'CIRCLE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={() => handleStampPress('CIRCLE')}
                      size={22}
                    />
                  </View>
                  <View style={{ margin: 5 }}>
                    <Button
                      id={'TRIANGLE'}
                      name={STAMP.TRIANGLE}
                      backgroundColor={currentMapMemoTool === 'TRIANGLE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={() => handleStampPress('TRIANGLE')}
                      size={22}
                    />
                  </View>
                  <View style={{ margin: 5 }}>
                    <Button
                      id={'SQUARE'}
                      name={STAMP.SQUARE}
                      backgroundColor={currentMapMemoTool === 'SQUARE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={() => handleStampPress('SQUARE')}
                      size={22}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.checkbox}>
                <CheckBox
                  label={t('common.snapWithLine')}
                  style={{ backgroundColor: COLOR.WHITE }}
                  labelColor="black"
                  width={300}
                  checked={snapped}
                  onCheck={(isChecked) => {
                    setSnapped(isChecked);
                    selectMapMemoSnapWithLine(isChecked);
                  }}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
