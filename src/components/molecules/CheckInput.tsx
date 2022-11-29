import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { View } from 'react-native';
import { TextInput } from '../atoms';

interface Props {
  label?: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  width?: number;
  onCheck: (checked: boolean) => void;
  onEndEditing: (text: string) => void;
  style?: { [key: string]: string | number };
  radio?: boolean;
}

export const CheckInput = React.memo((props: Props) => {
  const { label, text, checked, disabled, width, onCheck, onEndEditing, style, radio } = props;
  const [input, setInput] = useState('');

  const checkedIcon = useMemo(() => (radio ? 'checkbox-marked-circle-outline' : 'checkbox-marked-outline'), [radio]);
  const uncheckedIcon = useMemo(() => (radio ? 'checkbox-blank-circle-outline' : 'checkbox-blank-outline'), [radio]);

  const endEditing = () => {
    onEndEditing(input);
  };

  useEffect(() => {
    setInput(text);
  }, [text]);

  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        flex: 1,
        width: width,
        marginTop: 0,
      }}
    >
      <View style={{ width: 35 }}>
        <Button
          color={disabled ? COLOR.GRAY2 : COLOR.GRAY3}
          style={[{ backgroundColor: COLOR.MAIN }, style]}
          borderRadius={0}
          name={checked ? checkedIcon : uncheckedIcon}
          onPress={() => onCheck(!checked)}
          disabled={disabled}
        />
      </View>

      <View style={{ width: width ? width - 35 : 100 }}>
        <TextInput
          value={input}
          placeholder={checked ? '' : label}
          placeholderTextColor={COLOR.GRAY3}
          onChangeText={setInput}
          onEndEditing={endEditing}
          onBlur={endEditing}
          editable={checked}
          style={checked && { backgroundColor: COLOR.WHITE }}
        />
      </View>
    </View>
  );
});
