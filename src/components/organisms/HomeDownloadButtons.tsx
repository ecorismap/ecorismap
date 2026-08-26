import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

interface Props {
  isDownloadPossible: boolean;
  downloading: boolean;
  onPress: () => void;
}

export const HomeDownloadButtons = React.memo((props: Props) => {
  const { isDownloadPossible, downloading, onPress } = props;

  return (
    <View style={styles.buttonContainer}>
      {!downloading && (
        <View style={{ margin: 5 }}>
          <Button
            size={30}
            name="download"
            backgroundColor={isDownloadPossible ? COLOR.RED : COLOR.GRAY4}
            onPress={onPress}
            labelText={t('Home.label.download')}
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
