import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { COLOR, PEN_STYLE, PEN_WIDTH } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { ArrowStyleType, MapMemoToolType, PenWidthType } from '../../types';
import Button from '../atoms/Button';
import { CheckBox } from '../molecules/CheckBox';
import { Pressable } from '../atoms/Pressable';

interface Props {
  currentMapMemoTool: MapMemoToolType;
  modalVisible: boolean;
  arrowStyle: ArrowStyleType;
  isStraightStyle: boolean;
  isModalMapMemoToolHidden: boolean;
  currentPenWidth: PenWidthType;
  setIsModalMapMemoToolHidden: (value: boolean) => void;
  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
  selectMapMemoPenWidth: (penWidth: PenWidthType) => void;
  selectMapMemoArrowStyle: (arrowStyle: ArrowStyleType) => void;
  selectMapMemoStraightStyle: (straightStyle: boolean) => void;
  setVisibleMapMemoPen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalPenPicker = React.memo((props: Props) => {
  const {
    modalVisible,
    currentMapMemoTool,
    arrowStyle,
    isStraightStyle,
    isModalMapMemoToolHidden,
    currentPenWidth,
    setIsModalMapMemoToolHidden,
    selectMapMemoTool,
    selectMapMemoArrowStyle,
    selectMapMemoStraightStyle,
    setVisibleMapMemoPen,
    selectMapMemoPenWidth,
  } = props;

  const [penWidth, setPenWidth] = useState<PenWidthType>('PEN_THIN');
  const [arrowStyle_, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [straightStyle, setStraightStyle] = useState(false);

  useEffect(() => {
    if (modalVisible) {
      setPenWidth(currentPenWidth);
      setArrowStyle(arrowStyle);
      setStraightStyle(isStraightStyle);
    }
  }, [modalVisible, arrowStyle, currentMapMemoTool, currentPenWidth, isStraightStyle]);

  const handleCancel = () => {
    selectMapMemoTool(undefined);
    setVisibleMapMemoPen(false);
  };

  const handleOK = () => {
    selectMapMemoTool('PEN');
    selectMapMemoPenWidth(penWidth);
    selectMapMemoArrowStyle(arrowStyle_);
    selectMapMemoStraightStyle(straightStyle);
    setVisibleMapMemoPen(false);
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
      <Pressable style={styles.modalCenteredView} onPress={handleCancel} disablePressedAnimation>
        <Pressable
          style={styles.modalFrameView}
          onPress={() => {}} // モーダル本体は閉じない
          disablePressedAnimation
        >
          {/* バツボタン */}
          <Pressable
            style={styles.closeButton}
            onPress={handleCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: 400 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectPen')}`} </Text>

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
              <Text style={styles.modalSubTitle}>{`${t('common.strokeWidth')}`} </Text>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THIN'}
                    name={PEN_WIDTH.PEN_THIN}
                    backgroundColor={penWidth === 'PEN_THIN' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setPenWidth('PEN_THIN')}
                    labelText={t('Home.penPicker.thin')}
                    size={22}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_MEDIUM'}
                    name={PEN_WIDTH.PEN_MEDIUM}
                    backgroundColor={penWidth === 'PEN_MEDIUM' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setPenWidth('PEN_MEDIUM')}
                    labelText={t('Home.penPicker.medium')}
                    size={22}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THICK'}
                    name={PEN_WIDTH.PEN_THICK}
                    backgroundColor={penWidth === 'PEN_THICK' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setPenWidth('PEN_THICK')}
                    labelText={t('Home.penPicker.thick')}
                    size={22}
                  />
                </View>
              </View>
              <Text style={styles.modalSubTitle}>{`${t('common.straight_curve')}`} </Text>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'FREEHAND'}
                    name={PEN_STYLE.FREEHAND}
                    backgroundColor={!straightStyle ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setStraightStyle(false)}
                    labelText={t('Home.penPicker.curve')}
                    size={22}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'STRAIGHT'}
                    name={PEN_STYLE.STRAIGHT}
                    backgroundColor={straightStyle ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setStraightStyle(true)}
                    labelText={t('Home.penPicker.straight')}
                    size={22}
                  />
                </View>
              </View>
              <Text style={styles.modalSubTitle}>{`${t('common.arrow')}`} </Text>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'NONE'}
                    name={PEN_STYLE.NONE}
                    backgroundColor={arrowStyle_ === 'NONE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setArrowStyle('NONE')}
                    labelText={t('Home.penPicker.none')}
                    size={22}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_END'}
                    name={PEN_STYLE.ARROW_END}
                    backgroundColor={arrowStyle_ === 'ARROW_END' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setArrowStyle('ARROW_END')}
                    labelText={t('Home.penPicker.end')}
                    size={22}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_BOTH'}
                    name={PEN_STYLE.ARROW_BOTH}
                    backgroundColor={arrowStyle_ === 'ARROW_BOTH' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => setArrowStyle('ARROW_BOTH')}
                    labelText={t('Home.penPicker.bothSides')}
                    size={22}
                  />
                </View>
              </View>
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={handleOK}>
                <Text>OK</Text>
              </Pressable>
              <Pressable style={styles.modalOKCancelButton} onPress={handleCancel}>
                <Text>Cancel</Text>
              </Pressable>
            </View>

            <View style={{ width: 200, height: 50 }}>
              <CheckBox
                style={{ backgroundColor: COLOR.WHITE }}
                label={t('Home.modal.infoTool.checkbox')}
                width={200}
                checked={isModalMapMemoToolHidden}
                onCheck={() => setIsModalMapMemoToolHidden(!isModalMapMemoToolHidden)}
                numberOfLines={2}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
