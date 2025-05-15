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
  const [_eraser, setEraser] = React.useState<MapMemoToolType | undefined>(undefined);

  useEffect(() => {
    const defaultEraser = isEraserTool(currentMapMemoTool) ? currentMapMemoTool : 'PEN_ERASER';
    setEraser(defaultEraser);
  }, [currentMapMemoTool]);

  const handleEraserPress = (tool: MapMemoToolType) => {
    if (currentMapMemoTool === tool) {
      selectMapMemoTool(undefined);
    } else {
      selectMapMemoTool(tool);
    }
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
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          {/* バツボタン */}
          <Pressable
            style={styles.closeButton}
            onPress={() => setVisibleMapMemoEraser(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: 200 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectEraser')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => handleEraserPress('PEN_ERASER')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'PEN_ERASER'}
                    name={ERASER.ERASER}
                    backgroundColor={currentMapMemoTool === 'PEN_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('PEN_ERASER')}
                  />
                </View>
                <Text>{`${t('common.selectPenEraser')}`}</Text>
              </Pressable>

              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => handleEraserPress('BRUSH_ERASER')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'BRUSH_ERASER'}
                    name={ERASER.BRUSH_ERASER}
                    backgroundColor={currentMapMemoTool === 'BRUSH_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('BRUSH_ERASER')}
                  />
                </View>
                <Text>{`${t('common.selectBrushEraser')}`}</Text>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => handleEraserPress('STAMP_ERASER')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'STAMP_ERASER'}
                    name={ERASER.STAMP_ERASER}
                    backgroundColor={currentMapMemoTool === 'STAMP_ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => handleEraserPress('STAMP_ERASER')}
                  />
                </View>
                <Text>{`${t('common.selectStampEraser')}`}</Text>
              </Pressable>
            </View>
            {/* OK/Cancelボタン削除 */}
          </View>
        </View>
      </View>
    </Modal>
  );
});
