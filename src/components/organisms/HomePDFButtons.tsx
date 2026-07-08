import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { COLOR, ORIENTATIONTYPE } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { PaperOrientationType, PaperSizeType, ScaleType } from '../../types';
import { t } from '../../i18n/config';

interface Props {
  pdfTileMapZoomLevel: string;
  pdfOrientation: PaperOrientationType;
  pdfPaperSize: PaperSizeType;
  pdfScale: ScaleType;
  onPress: () => void;
  pressPDFSettingsOpen: () => void;
  // Web版はモバイルの戻る付きヘッダーが無いため、ここに戻るボタンを表示する
  pressBack?: () => void;
}

export const HomePDFButtons = React.memo((props: Props) => {
  const { pdfTileMapZoomLevel, pdfOrientation, pdfPaperSize, pdfScale, onPress, pressPDFSettingsOpen, pressBack } =
    props;
  const scaleText = `1:${parseInt(pdfScale, 10).toLocaleString('en-US')}`;

  return (
    <View style={styles.buttonContainer}>
      <View style={{ margin: 5 }}>
        <Button
          size={30}
          name="download"
          backgroundColor={COLOR.RED}
          onPress={onPress}
          labelText={t('Home.label.pdfdownload')}
        />
      </View>
      <Pressable
        onPress={pressPDFSettingsOpen}
        style={{ borderWidth: 1, margin: 2, padding: 2, borderRadius: 2, backgroundColor: COLOR.WHITE }}
      >
        <Text>{`${pdfPaperSize} ${ORIENTATIONTYPE[pdfOrientation]} ${scaleText} ${pdfTileMapZoomLevel}`}</Text>
      </Pressable>
      {pressBack !== undefined && (
        <View style={{ margin: 5, marginTop: 20 }}>
          <Button
            size={30}
            name="arrow-left"
            backgroundColor={COLOR.GRAY3}
            onPress={pressBack}
            labelText={t('common.back')}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    zIndex: 100,
  },
});
