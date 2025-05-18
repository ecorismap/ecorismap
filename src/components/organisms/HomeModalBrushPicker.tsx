import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { BRUSH, COLOR, PLUGIN } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { MapMemoToolType } from '../../types';
import Button from '../atoms/Button';

interface Props {
  currentMapMemoTool: MapMemoToolType;
  modalVisible: boolean;

  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
  setVisibleMapMemoBrush: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalBrushPicker = React.memo((props: Props) => {
  const { currentMapMemoTool, modalVisible, selectMapMemoTool, setVisibleMapMemoBrush } = props;
  const [_brush, setBrush] = useState<MapMemoToolType | undefined>(undefined);

  useEffect(() => {
    setBrush(currentMapMemoTool);
  }, [currentMapMemoTool]);

  const handleBrushPress = (tool: MapMemoToolType) => {
    selectMapMemoTool(tool);
    setVisibleMapMemoBrush(false);
  };

  const styles = StyleSheet.create({
    checkbox: {
      //backgroundColor: COLOR.BLUE,
      flexDirection: 'column',
      height: 45,
      //justifyContent: 'space-between',
      margin: 2,
      width: 180,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
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
      alignSelf: 'flex-start',
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
          setVisibleMapMemoBrush(false);
        }}
        disablePressedAnimation
      >
        <Pressable
          style={styles.modalFrameView}
          onPress={() => {}} // モーダル本体は閉じない
          disablePressedAnimation
        >
          {/* バツボタン */}
          <Pressable
            style={styles.closeButton}
            onPress={() => {
              selectMapMemoTool(undefined);
              setVisibleMapMemoBrush(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: PLUGIN.HISYOUTOOL ? 380 : 180 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectBrush')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10, width: 220 }}>
              {PLUGIN.HISYOUTOOL && (
                <View
                  style={{
                    alignItems: 'center',
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
                        id={'SENKAI'}
                        name={BRUSH.SENKAI}
                        backgroundColor={currentMapMemoTool === 'SENKAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('SENKAI')}
                        labelText="旋回"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'SENJYOU'}
                        name={BRUSH.SENJYOU}
                        backgroundColor={currentMapMemoTool === 'SENJYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('SENJYOU')}
                        labelText="旋上"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'KYUKOKA'}
                        name={BRUSH.KYUKOKA}
                        backgroundColor={currentMapMemoTool === 'KYUKOKA' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('KYUKOKA')}
                        labelText="急降下"
                        size={22}
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'DISPLAY1'}
                        name={BRUSH.DISPLAY1}
                        backgroundColor={currentMapMemoTool === 'DISPLAY1' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('DISPLAY1')}
                        labelText="誇示1"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'DISPLAY2'}
                        name={BRUSH.DISPLAY2}
                        backgroundColor={currentMapMemoTool === 'DISPLAY2' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('DISPLAY2')}
                        labelText="誇示2"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'KOUGEKI'}
                        name={BRUSH.KOUGEKI}
                        backgroundColor={currentMapMemoTool === 'KOUGEKI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('KOUGEKI')}
                        labelText="排斥"
                        size={22}
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'TANJI'}
                        name={BRUSH.TANJI}
                        backgroundColor={currentMapMemoTool === 'TANJI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('TANJI')}
                        labelText="探餌"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'ESA'}
                        name={BRUSH.ESA}
                        backgroundColor={currentMapMemoTool === 'ESA' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('ESA')}
                        labelText="餌運搬"
                        size={22}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'SUZAI'}
                        name={BRUSH.SUZAI}
                        backgroundColor={currentMapMemoTool === 'SUZAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => handleBrushPress('SUZAI')}
                        labelText="巣材運搬"
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
                  alignItems: 'center',
                }}
              >
                <Text style={styles.modalSubTitle}>{`${t('common.common')}`} </Text>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ margin: 5 }}>
                    <Button
                      id={'PLUS'}
                      name={BRUSH.PLUS}
                      backgroundColor={currentMapMemoTool === 'PLUS' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={() => handleBrushPress('PLUS')}
                      size={22}
                    />
                  </View>
                  <View style={{ margin: 5 }}>
                    <Button
                      id={'CROSS'}
                      name={BRUSH.CROSS}
                      backgroundColor={currentMapMemoTool === 'CROSS' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={() => handleBrushPress('CROSS')}
                      size={22}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
