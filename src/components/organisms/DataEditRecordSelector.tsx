import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { RecordType } from '../../types';

import { Button } from '../atoms';

interface Props {
  recordNumber: number;
  recordSet: RecordType[];
  setRecordNumber: Dispatch<SetStateAction<number>>;
  onChange: (record: RecordType) => void;
}

export const DataEditRecordSelector = (props: Props) => {
  const { recordNumber, recordSet, setRecordNumber, onChange } = props;

  const maxNumber = recordSet.length;
  const onPressPrevious = useCallback(() => {
    const value = recordNumber > 1 ? recordNumber - 1 : 1;
    setRecordNumber(value);
    onChange(recordSet[value - 1]);
  }, [onChange, recordNumber, recordSet, setRecordNumber]);

  const onPressNext = useCallback(() => {
    const value = recordNumber < maxNumber ? recordNumber + 1 : maxNumber;
    setRecordNumber(value);
    onChange(recordSet[value - 1]);
  }, [maxNumber, onChange, recordNumber, recordSet, setRecordNumber]);

  return (
    <View style={styles.buttonContainer}>
      <Button
        name="arrow-left-bold-outline"
        backgroundColor={COLOR.MAIN}
        color={COLOR.BLACK}
        onPress={onPressPrevious}
      />
      <Text>{`${recordNumber}/${maxNumber}`}</Text>
      <Button name="arrow-right-bold-outline" backgroundColor={COLOR.MAIN} color={COLOR.BLACK} onPress={onPressNext} />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginLeft: 80,
  },
});
