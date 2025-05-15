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
  isMapMemoLineSmoothed: boolean;
  isModalMapMemoToolHidden: boolean;
  currentPenWidth: PenWidthType;
  setIsModalMapMemoToolHidden: (value: boolean) => void;
  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
  selectMapMemoPenWidth: (penWidth: PenWidthType) => void;
  selectMapMemoArrowStyle: (arrowStyle: ArrowStyleType) => void;
  selectMapMemoStraightStyle: (straightStyle: boolean) => void;
  selectMapMemoLineSmoothed: (smoothed: boolean) => void;
  setVisibleMapMemoPen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalPenPicker = React.memo((props: Props) => {
  const {
    modalVisible,
    currentMapMemoTool,
    arrowStyle,
    isStraightStyle,
    isMapMemoLineSmoothed,
    isModalMapMemoToolHidden,
    currentPenWidth,
    setIsModalMapMemoToolHidden,
    selectMapMemoTool,
    selectMapMemoArrowStyle,
    selectMapMemoStraightStyle,
    selectMapMemoLineSmoothed,
    setVisibleMapMemoPen,
    selectMapMemoPenWidth,
  } = props;

  const [penWidth, setPenWidth] = useState<PenWidthType>('PEN_THIN');
  const [arrowStyle_, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [straightStyle, setStraightStyle] = useState(false);

  const [_smoothed, setSmoothed] = useState(false);

  useEffect(() => {
    setPenWidth(currentPenWidth);
    setArrowStyle(arrowStyle);
    setStraightStyle(isStraightStyle);
    setSmoothed(isMapMemoLineSmoothed);
  }, [arrowStyle, currentMapMemoTool, currentPenWidth, isMapMemoLineSmoothed, isStraightStyle]);

  const handlePenWidth = (width: PenWidthType) => {
    setPenWidth(width);
    selectMapMemoPenWidth(width);
    selectMapMemoTool('PEN');
  };
  const handleStraightStyle = (straight: boolean) => {
    setStraightStyle(straight);
    selectMapMemoStraightStyle(straight);
    selectMapMemoTool('PEN');
  };
  const handleArrowStyle = (style: ArrowStyleType) => {
    setArrowStyle(style);
    selectMapMemoArrowStyle(style);
    selectMapMemoTool('PEN');
    if (style === 'NONE') {
      setSmoothed(false);
      selectMapMemoLineSmoothed(false);
    } else {
      setSmoothed(true);
      selectMapMemoLineSmoothed(true);
    }
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
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          {/* バツボタン */}
          <Pressable
            style={styles.closeButton}
            onPress={() => setVisibleMapMemoPen(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={[styles.modalContents, { width: 200, height: 300 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectPen')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10 }}>
              <Text style={styles.modalSubTitle}>{`${t('common.strokeWidth')}`} </Text>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THIN'}
                    name={PEN_WIDTH.PEN_THIN}
                    backgroundColor={penWidth === 'PEN_THIN' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handlePenWidth('PEN_THIN')}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_MEDIUM'}
                    name={PEN_WIDTH.PEN_MEDIUM}
                    backgroundColor={penWidth === 'PEN_MEDIUM' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handlePenWidth('PEN_MEDIUM')}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THICK'}
                    name={PEN_WIDTH.PEN_THICK}
                    backgroundColor={penWidth === 'PEN_THICK' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handlePenWidth('PEN_THICK')}
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
                    onPress={() => handleStraightStyle(false)}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'STRAIGHT'}
                    name={PEN_STYLE.STRAIGHT}
                    backgroundColor={straightStyle ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handleStraightStyle(true)}
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
                    onPress={() => handleArrowStyle('NONE')}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_END'}
                    name={PEN_STYLE.ARROW_END}
                    backgroundColor={arrowStyle_ === 'ARROW_END' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handleArrowStyle('ARROW_END')}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_BOTH'}
                    name={PEN_STYLE.ARROW_BOTH}
                    backgroundColor={arrowStyle_ === 'ARROW_BOTH' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => handleArrowStyle('ARROW_BOTH')}
                  />
                </View>
              </View>
            </View>
            {/* <View style={styles.checkbox}>
              <CheckBox
                label={t('common.smoothLine')}
                style={{ backgroundColor: COLOR.WHITE }}
                labelColor="black"
                width={300}
                checked={smoothed}
                onCheck={setSmoothed}
              />
            </View> */}
            {/* OK/Cancelボタン削除 */}
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
        </View>
      </View>
    </Modal>
  );
});
