import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { DrawToolType, LineToolType } from '../../types';

import { Button } from '../atoms';
import { t } from 'i18next';

interface Props {
  disabled?: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  button: {
    marginTop: 2,
  },
});

export const HomeLineToolButton = React.memo((props: Props) => {
  const { disabled, currentDrawTool, selectDrawTool, setLineTool } = props;

  return (
    <View style={styles.container}>
      <View style={styles.button}>
        <Button
          id={'PLOT_LINE'}
          name={LINETOOL.PLOT_LINE}
          disabled={disabled}
          backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => {
            setLineTool('PLOT_LINE');
            selectDrawTool('PLOT_LINE');
          }}
          labelText={t('Home.label.plotLine')}
        />
      </View>
    </View>
  );
});
