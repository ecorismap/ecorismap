import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { COLOR, ERASER } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { MapMemoToolType } from '../../types';
import { isEraserTool } from '../../utils/General';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';

interface Props {
  currentMapMemoTool: MapMemoToolType;
  modalVisible: boolean;

  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
  setVisibleMapMemoEraser: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalEraserPicker = React.memo((props: Props) => {
  const { currentMapMemoTool, modalVisible, selectMapMemoTool, setVisibleMapMemoEraser } = props;
  const [eraser, setEraser] = React.useState<MapMemoToolType | undefined>(undefined);

  useEffect(() => {
    const defaultEraser = isEraserTool(currentMapMemoTool) ? currentMapMemoTool : 'PEN_ERASER';
    setEraser(defaultEraser);
  }, [currentMapMemoTool]);

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
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: 200, height: 250 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectEraser')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setEraser('PEN_ERASER');
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'PEN_ERASER'}
                    name={ERASER.ERASER}
                    backgroundColor={eraser === 'PEN_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setEraser('PEN_ERASER');
                    }}
                  />
                </View>
                <Text>{`${t('common.selectPenEraser')}`}</Text>
              </Pressable>

              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setEraser('BRUSH_ERASER');
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'BRUSH_ERASER'}
                    name={ERASER.BRUSH_ERASER}
                    backgroundColor={eraser === 'BRUSH_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setEraser('BRUSH_ERASER');
                    }}
                  />
                </View>

                <Text>{`${t('common.selectBrushEraser')}`}</Text>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  setEraser('STAMP_ERASER');
                }}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'STAMP_ERASER'}
                    name={ERASER.STAMP_ERASER}
                    backgroundColor={eraser === 'STAMP_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => {
                      setEraser('STAMP_ERASER');
                    }}
                  />
                </View>
                <Text>{`${t('common.selectStampEraser')}`}</Text>
              </Pressable>
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable
                style={styles.modalOKCancelButton}
                onPress={() => {
                  selectMapMemoTool(eraser);
                  setVisibleMapMemoEraser(false);
                }}
              >
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => {
                  selectMapMemoTool(undefined);
                  setVisibleMapMemoEraser(false);
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
