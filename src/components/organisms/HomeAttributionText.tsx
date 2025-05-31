import React from 'react';
import { View, Text, Platform } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  bottom: number;
  attribution: string;
}

export const HomeAttributionText = React.memo((props: Props) => {
  const { bottom, attribution } = props;
  if (!attribution) return null;

  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={{
        position: 'absolute',
        bottom,
        alignSelf: 'flex-end',
        paddingRight: 15,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          color: COLOR.BLACK,
          ...(isWeb
            ? { textShadow: `1px 1px 1px ${COLOR.WHITE}` }
            : {
                textShadowColor: COLOR.WHITE,
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 1,
              }),
        }}
      >
        {`${t('common.source')}`}: {attribution}
      </Text>
    </View>
  );
});
