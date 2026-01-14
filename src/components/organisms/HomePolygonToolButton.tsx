import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, POLYGONTOOL } from '../../constants/AppConstants';
import { DrawToolType, PolygonToolType } from '../../types';

import { Button } from '../atoms';
import { t } from 'i18next';

interface Props {
  disabled?: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  button: {
    marginTop: 2,
  },
});

export const HomePolygonToolButton = React.memo((props: Props) => {
  const { disabled, currentDrawTool, selectDrawTool, setPolygonTool } = props;

  return (
    <View style={styles.container}>
      <View style={styles.button}>
        <Button
          id={'PLOT_POLYGON'}
          name={POLYGONTOOL.PLOT_POLYGON}
          disabled={disabled}
          backgroundColor={
            disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
          }
          borderRadius={10}
          onPress={() => {
            setPolygonTool('PLOT_POLYGON');
            selectDrawTool('PLOT_POLYGON');
          }}
          labelText={t('Home.label.plotPolygon')}
        />
      </View>
      <View style={styles.button}>
        <Button
          id={'FREEHAND_POLYGON'}
          name={POLYGONTOOL.FREEHAND_POLYGON}
          disabled={disabled}
          backgroundColor={
            disabled ? COLOR.ALFAGRAY : currentDrawTool === 'FREEHAND_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
          }
          borderRadius={10}
          onPress={() => {
            setPolygonTool('FREEHAND_POLYGON');
            selectDrawTool('FREEHAND_POLYGON');
          }}
          labelText={t('Home.label.freehandPolygon')}
        />
      </View>
    </View>
  );
});
