import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { COLOR, PEN, PEN_STYLE } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { ArrowStyleType, MapMemoToolType } from '../../types';
import Button from '../atoms/Button';
import { isPenTool } from '../../utils/General';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  currentMapMemoTool: MapMemoToolType;
  modalVisible: boolean;
  arrowStyle: ArrowStyleType;
  isStraightStyle: boolean;
  isMapMemoLineSmoothed: boolean;
  selectMapMemoTool: (mapMemoTool: MapMemoToolType | undefined) => void;
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
    selectMapMemoTool,
    selectMapMemoArrowStyle,
    selectMapMemoStraightStyle,
    selectMapMemoLineSmoothed,
    setVisibleMapMemoPen,
  } = props;
  const { windowWidth } = useWindow();
  const [pen, setPen] = useState<MapMemoToolType | undefined>(undefined);

  const [arrowStyle_, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [straightStyle, setStraightStyle] = useState(false);

  const [smoothed, setSmoothed] = useState(false);

  useEffect(() => {
    const defaultPen = isPenTool(currentMapMemoTool) ? currentMapMemoTool : 'PEN_THIN';
    setPen(defaultPen);
    setArrowStyle(arrowStyle);
    setStraightStyle(isStraightStyle);
    setSmoothed(isMapMemoLineSmoothed);
  }, [arrowStyle, currentMapMemoTool, isMapMemoLineSmoothed, isStraightStyle]);

  const styles = StyleSheet.create({
    checkbox: {
      //backgroundColor: COLOR.BLUE,
      flexDirection: 'column',
      height: 45,
      //justifyContent: 'space-between',
      margin: 2,
      width: windowWidth * 0.4,
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
  });

  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: windowWidth * 0.5, height: 350 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectPen')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10 }}>
              <Text style={styles.modalSubTitle}>{`${t('common.strokeWidth')}`} </Text>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THIN'}
                    name={PEN.PEN_THIN}
                    backgroundColor={pen === 'PEN_THIN' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (pen === 'PEN_THIN' ? setPen(undefined) : setPen('PEN_THIN'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_MEDIUM'}
                    name={PEN.PEN_MEDIUM}
                    backgroundColor={pen === 'PEN_MEDIUM' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (pen === 'PEN_MEDIUM' ? setPen(undefined) : setPen('PEN_MEDIUM'))}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'PEN_THICK'}
                    name={PEN.PEN_THICK}
                    backgroundColor={pen === 'PEN_THICK' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => (pen === 'PEN_THICK' ? setPen(undefined) : setPen('PEN_THICK'))}
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
                    onPress={() => {
                      setStraightStyle(false);
                    }}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'STRAIGHT'}
                    name={PEN_STYLE.STRAIGHT}
                    backgroundColor={straightStyle ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => {
                      setStraightStyle(true);
                    }}
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
                    onPress={() => {
                      setArrowStyle('NONE');
                    }}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_END'}
                    name={PEN_STYLE.ARROW_END}
                    backgroundColor={arrowStyle_ === 'ARROW_END' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => {
                      setArrowStyle('ARROW_END');
                    }}
                  />
                </View>
                <View style={{ margin: 5 }}>
                  <Button
                    id={'ARROW_BOTH'}
                    name={PEN_STYLE.ARROW_BOTH}
                    backgroundColor={arrowStyle_ === 'ARROW_BOTH' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => {
                      setArrowStyle('ARROW_BOTH');
                    }}
                  />
                </View>
              </View>
            </View>

            <View style={styles.checkbox}>
              <CheckBox
                label={t('common.smoothLine')}
                style={{ backgroundColor: COLOR.WHITE }}
                labelColor="black"
                width={300}
                checked={smoothed}
                onCheck={setSmoothed}
              />
            </View>

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalOKCancelButton}
                onPress={() => {
                  selectMapMemoTool(pen);
                  selectMapMemoArrowStyle(arrowStyle_);
                  selectMapMemoStraightStyle(straightStyle);
                  selectMapMemoLineSmoothed(smoothed);
                  setVisibleMapMemoPen(false);
                }}
              >
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => setVisibleMapMemoPen(false)}>
                <Text>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
