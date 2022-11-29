import React from 'react';
import { View, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  bottom: number;
  attribution: string;
}

export const HomeAttributionText = (props: Props) => {
  const { bottom, attribution } = props;

  return attribution.length > 0 ? (
    <View style={{ position: 'absolute', bottom: bottom, alignSelf: 'flex-end', paddingBottom: 0, paddingRight: 15 }}>
      <Text
        style={{
          fontSize: 9,
          color: COLOR.BLACK,
          textShadowColor: COLOR.WHITE,
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 1,
        }}
      >
        {t('common.source')}: {attribution}
      </Text>
    </View>
  ) : null;
};
