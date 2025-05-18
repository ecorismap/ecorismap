import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR, INFOTOOL } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { Button } from '../atoms';
import { InfoToolType } from '../../types';

interface Props {
  currentInfoTool: InfoToolType;
  modalVisible: boolean;
  isModalInfoToolHidden: boolean;

  selectInfoTool: (infoTool: InfoToolType | undefined) => void;
  setVisibleInfoPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setIsModalInfoToolHidden: (value: boolean) => void;
}

export const HomeModalInfoPicker = React.memo((props: Props) => {
  const { currentInfoTool, modalVisible, selectInfoTool, setVisibleInfoPicker } = props;
  const [infoTool, setInfoTool] = useState<InfoToolType>('ALL_INFO');

  useEffect(() => {
    setInfoTool(currentInfoTool);
  }, [currentInfoTool]);

  const styles = StyleSheet.create({
    checkbox: {
      //backgroundColor: COLOR.BLUE,
      flexDirection: 'column',
      height: 120,
      //justifyContent: 'space-between',
      margin: 5,
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
      <Pressable
        style={styles.modalCenteredView}
        onPress={() => {
          selectInfoTool(undefined);
          setVisibleInfoPicker(false);
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
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 1,
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => {
              selectInfoTool(undefined);
              setVisibleInfoPicker(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 24, color: COLOR.GRAY2 }}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: 300 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectionType')}`} </Text>
            <View
              style={{
                flexDirection: 'column',
                margin: 10,
                borderWidth: 1,
                borderRadius: 5,
                padding: 20,
                borderColor: COLOR.GRAY3,
              }}
            >
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setInfoTool('ALL_INFO');
                  selectInfoTool('ALL_INFO');
                  setVisibleInfoPicker(false);
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    name={INFOTOOL.ALL_INFO}
                    backgroundColor={infoTool === 'ALL_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setInfoTool('ALL_INFO');
                      selectInfoTool('ALL_INFO');
                      setVisibleInfoPicker(false);
                    }}
                  />
                </View>
                <Text>{`${t('common.selectAllInfo')}`}</Text>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setInfoTool('POINT_INFO');
                  selectInfoTool('POINT_INFO');
                  setVisibleInfoPicker(false);
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    name={INFOTOOL.POINT_INFO}
                    backgroundColor={infoTool === 'POINT_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setInfoTool('POINT_INFO');
                      selectInfoTool('POINT_INFO');
                      setVisibleInfoPicker(false);
                    }}
                  />
                </View>
                <Text>{`${t('common.selectPointInfo')}`}</Text>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setInfoTool('LINE_INFO');
                  selectInfoTool('LINE_INFO');
                  setVisibleInfoPicker(false);
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    name={INFOTOOL.LINE_INFO}
                    backgroundColor={infoTool === 'LINE_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setInfoTool('LINE_INFO');
                      selectInfoTool('LINE_INFO');
                      setVisibleInfoPicker(false);
                    }}
                  />
                </View>
                <Text>{`${t('common.selectLineInfo')}`}</Text>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setInfoTool('POLYGON_INFO');
                  selectInfoTool('POLYGON_INFO');
                  setVisibleInfoPicker(false);
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    name={INFOTOOL.POLYGON_INFO}
                    backgroundColor={infoTool === 'POLYGON_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setInfoTool('POLYGON_INFO');
                      selectInfoTool('POLYGON_INFO');
                      setVisibleInfoPicker(false);
                    }}
                  />
                </View>
                <Text>{`${t('common.selectPolygonInfo')}`}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
