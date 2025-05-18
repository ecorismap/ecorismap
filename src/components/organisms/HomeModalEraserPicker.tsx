import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
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
  const [_eraser, setEraser] = React.useState<MapMemoToolType | undefined>(undefined);

  useEffect(() => {
    const defaultEraser = isEraserTool(currentMapMemoTool) ? currentMapMemoTool : 'PEN_ERASER';
    setEraser(defaultEraser);
  }, [currentMapMemoTool]);

  const handleEraserPress = (tool: MapMemoToolType) => {
    selectMapMemoTool(tool);
    setVisibleMapMemoEraser(false);
  };

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
          setVisibleMapMemoEraser(false);
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
              setVisibleMapMemoEraser(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: 230 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectEraser')}`} </Text>
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
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLOR.WHITE,
                  borderRadius: 5,
                  width: 200,
                  marginVertical: 5,
                }}
                onPress={() => handleEraserPress('PEN_ERASER')}
              >
                <View style={{ marginVertical: 0, marginRight: 10 }}>
                  <Button
                    id={'PEN_ERASER'}
                    name={
                      currentMapMemoTool === 'PEN_ERASER'
                        ? 'checkbox-marked-circle-outline'
                        : 'checkbox-blank-circle-outline'
                    }
                    color={COLOR.GRAY4}
                    backgroundColor={COLOR.WHITE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('PEN_ERASER')}
                    size={24}
                  />
                </View>
                <Text style={{ fontSize: 15, textAlignVertical: 'center' }}>{`${t('common.selectPenEraser')}`}</Text>
              </Pressable>

              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLOR.WHITE,
                  borderRadius: 5,
                  width: 200,
                  marginVertical: 5,
                }}
                onPress={() => handleEraserPress('BRUSH_ERASER')}
              >
                <View style={{ marginVertical: 0, marginRight: 10 }}>
                  <Button
                    id={'BRUSH_ERASER'}
                    name={
                      currentMapMemoTool === 'BRUSH_ERASER'
                        ? 'checkbox-marked-circle-outline'
                        : 'checkbox-blank-circle-outline'
                    }
                    color={COLOR.GRAY4}
                    backgroundColor={COLOR.WHITE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('BRUSH_ERASER')}
                    size={24}
                  />
                </View>
                <Text style={{ fontSize: 15, textAlignVertical: 'center' }}>{`${t('common.selectBrushEraser')}`}</Text>
              </Pressable>
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLOR.WHITE,
                  borderRadius: 5,
                  width: 200,
                  marginVertical: 5,
                }}
                onPress={() => handleEraserPress('STAMP_ERASER')}
              >
                <View style={{ marginVertical: 0, marginRight: 10 }}>
                  <Button
                    id={'STAMP_ERASER'}
                    name={
                      currentMapMemoTool === 'STAMP_ERASER'
                        ? 'checkbox-marked-circle-outline'
                        : 'checkbox-blank-circle-outline'
                    }
                    color={COLOR.GRAY4}
                    backgroundColor={COLOR.WHITE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('STAMP_ERASER')}
                    size={24}
                  />
                </View>
                <Text style={{ fontSize: 15, textAlignVertical: 'center' }}>{`${t('common.selectStampEraser')}`}</Text>
              </Pressable>
            </View>
            {/* OK/Cancelボタン削除 */}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
