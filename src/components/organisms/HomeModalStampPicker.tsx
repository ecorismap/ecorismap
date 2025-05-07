import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { COLOR, PLUGIN, STAMP } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { MapMemoToolType } from '../../types';
import Button from '../atoms/Button';
import { CheckBox } from '../molecules/CheckBox';

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
  const [stamp, setStamp] = useState<MapMemoToolType | undefined>(undefined);
  const [snapped, setSnapped] = useState(false);

  useEffect(() => {
    setStamp(currentMapMemoTool);
    setSnapped(snapWithLine);
  }, [currentMapMemoTool, snapWithLine]);

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
  });
  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: 200, height: PLUGIN.HISYOUTOOL ? 310 : 230 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectStamp')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10, width: 180 }}>
              <Text style={styles.modalSubTitle}>{`${t('common.common')}`} </Text>
              {/* <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'NUMBERS'}
                    name={STAMP.NUMBERS}
                    backgroundColor={stamp === 'NUMBERS' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'NUMBERS' ? setStamp(undefined) : setStamp('NUMBERS'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ALPHABETS'}
                    name={STAMP.ALPHABETS}
                    backgroundColor={stamp === 'ALPHABETS' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'ALPHABETS' ? setStamp(undefined) : setStamp('ALPHABETS'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'TEXT'}
                    name={STAMP.TEXT}
                    backgroundColor={stamp === 'TEXT' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'TEXT' ? setStamp(undefined) : setStamp('TEXT'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'IMAGE'}
                    name={STAMP.IMAGE}
                    backgroundColor={stamp === 'IMAGE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'IMAGE' ? setStamp(undefined) : setStamp('IMAGE'))}
                  />
                </View>
              </View> */}

              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'CIRCLE'}
                    name={STAMP.CIRCLE}
                    backgroundColor={stamp === 'CIRCLE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'CIRCLE' ? setStamp(undefined) : setStamp('CIRCLE'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'TRIANGLE'}
                    name={STAMP.TRIANGLE}
                    backgroundColor={stamp === 'TRIANGLE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'TRIANGLE' ? setStamp(undefined) : setStamp('TRIANGLE'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'SQUARE'}
                    name={STAMP.SQUARE}
                    backgroundColor={stamp === 'SQUARE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (stamp === 'SQUARE' ? setStamp(undefined) : setStamp('SQUARE'))}
                  />
                </View>
              </View>
              {PLUGIN.HISYOUTOOL && (
                <>
                  <Text style={styles.modalSubTitle}>{`飛翔図`} </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'TOMARI'}
                        name={STAMP.TOMARI}
                        backgroundColor={stamp === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => (stamp === 'TOMARI' ? setStamp(undefined) : setStamp('TOMARI'))}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'KARI'}
                        name={STAMP.KARI}
                        backgroundColor={stamp === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => (stamp === 'KARI' ? setStamp(undefined) : setStamp('KARI'))}
                      />
                    </View>
                    <View style={{ margin: 5 }}>
                      <Button
                        id={'HOVERING'}
                        name={STAMP.HOVERING}
                        backgroundColor={stamp === 'HOVERING' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => (stamp === 'HOVERING' ? setStamp(undefined) : setStamp('HOVERING'))}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>

            <View style={styles.checkbox}>
              <CheckBox
                label={t('common.snapWithLine')}
                style={{ backgroundColor: COLOR.WHITE }}
                labelColor="black"
                width={300}
                checked={snapped}
                onCheck={setSnapped}
              />
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable
                style={styles.modalOKCancelButton}
                onPress={() => {
                  selectMapMemoTool(stamp);
                  selectMapMemoSnapWithLine(snapped);
                  setVisibleMapMemoStamp(false);
                }}
              >
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => {
                  selectMapMemoTool(undefined);
                  setVisibleMapMemoStamp(false);
                }}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
