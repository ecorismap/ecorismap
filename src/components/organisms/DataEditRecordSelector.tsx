import React, { useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

import { Button } from '../atoms';

interface Props {
  recordNumber: number;
  maxRecordNumber: number;
  onChangeRecord: (value: number) => void;
}

export const DataEditRecordSelector = (props: Props) => {
  const { recordNumber, maxRecordNumber, onChangeRecord } = props;

  const onPressPrevious = useCallback(() => {
    const value = recordNumber > 1 ? recordNumber - 1 : 1;
    onChangeRecord(value);
  }, [onChangeRecord, recordNumber]);

  const onPressNext = useCallback(() => {
    const value = recordNumber < maxRecordNumber ? recordNumber + 1 : maxRecordNumber;
    onChangeRecord(value);
  }, [maxRecordNumber, onChangeRecord, recordNumber]);

  return (
    <View style={styles.buttonContainer}>
      <Button
        name="arrow-left-bold-outline"
        backgroundColor={COLOR.MAIN}
        color={COLOR.BLACK}
        onPress={onPressPrevious}
        size={25}
      />
      <Text>{`${recordNumber}/${maxRecordNumber}`}</Text>
      <Button
        name="arrow-right-bold-outline"
        backgroundColor={COLOR.MAIN}
        color={COLOR.BLACK}
        onPress={onPressNext}
        size={25}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    height: 45,
    justifyContent: 'center',
    marginLeft: 0,
  },
});
