import React, { useMemo } from 'react';

import { Button } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { View, Text } from 'react-native';

interface Props {
  label?: string;
  labelAlign?: 'row' | 'column';
  labelSize?: number;
  labelWeight?: 'bold';
  labelColor?: string;
  checked: boolean;
  disabled?: boolean;
  width?: number;
  onCheck: (checked: boolean) => void;
  style?: { [key: string]: string | number };
  radio?: boolean;
  numberOfLines?: number;
}

export const CheckBox = React.memo((props: Props) => {
  const {
    label,
    labelAlign,
    labelSize,
    labelWeight,
    labelColor,
    checked,
    disabled,
    width,
    onCheck,
    style,
    radio,
    numberOfLines,
  } = props;

  const checkedIcon = useMemo(() => (radio ? 'checkbox-marked-circle-outline' : 'checkbox-marked-outline'), [radio]);
  const uncheckedIcon = useMemo(() => (radio ? 'checkbox-blank-circle-outline' : 'checkbox-blank-outline'), [radio]);

  return (
    <View
      style={{
        alignItems: 'center',
        //justifyContent: 'flex-start',
        flexDirection: labelAlign ? labelAlign : 'row',
        flex: 1,
        width: width,
        marginTop: labelAlign === 'column' ? 10 : 0,
        //marginHorizontal: 0,
        //backgroundColor: COLOR.BLUE,
      }}
    >
      {(labelAlign === undefined || labelAlign === 'row') && (
        <View style={{ width: 35 }}>
          <Button
            color={disabled ? COLOR.GRAY2 : COLOR.GRAY4}
            style={[{ backgroundColor: COLOR.MAIN }, style]}
            borderRadius={0}
            name={checked ? checkedIcon : uncheckedIcon}
            onPress={() => onCheck(!checked)}
            disabled={disabled}
          />
        </View>
      )}
      {label && (
        <View style={{ width: width ? width - 35 : 100 }}>
          <Text
            style={{
              fontSize: labelSize ?? 12,
              fontWeight: labelWeight ?? 'normal',
              color: labelColor ?? COLOR.GRAY4,
              verticalAlign: labelAlign === 'column' ? 'bottom' : 'middle',
              textAlignVertical: labelAlign === 'column' ? 'bottom' : 'center',
              textAlign: labelAlign === 'column' ? 'center' : 'left',

              //maxWidth: 500,
              marginHorizontal: 5,
              //backgroundColor: COLOR.BLUE,
            }}
            //adjustsFontSizeToFit={true}
            numberOfLines={numberOfLines ?? 1}
          >
            {label}
          </Text>
        </View>
      )}
      {labelAlign === 'column' && (
        <View style={{ flex: 2 }}>
          <Button
            color={disabled ? COLOR.GRAY2 : COLOR.GRAY4}
            style={[{ backgroundColor: COLOR.MAIN }, style]}
            borderRadius={0}
            name={checked ? checkedIcon : uncheckedIcon}
            onPress={() => onCheck(!checked)}
            disabled={disabled}
          />
        </View>
      )}
    </View>
  );
});
