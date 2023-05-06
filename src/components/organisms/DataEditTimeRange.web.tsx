import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import TextField from '@mui/material/TextField';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { LocalizedDateFormatForWeb } from '../../i18n/dayjs';
import { t } from '../../i18n/config';

interface Props {
  name: string;
  value: string;
  editable?: boolean;
  mode: 'date' | 'time' | 'datetime';
  onValueChange: (value: string) => void;
}

export const DataEditTimeRange = (props: Props) => {
  const { name, value, mode, onValueChange } = props;
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');

  // console.log('###', value);

  useEffect(() => {
    if (value === '') return;
    const splitedValue = value.split(t('common.ndash'));
    setValue1(splitedValue[0]);
    setValue2(splitedValue[1]);
  }, [value]);

  const stringToDate = useCallback(
    (stringValue: string) => {
      if (stringValue === '') return null;
      if (mode === 'time') {
        return new Date(`2000/1/1 ${stringValue}`);
      } else if (mode === 'date') {
        return new Date(stringValue);
      } else {
        return new Date(stringValue);
      }
    },
    [mode]
  );

  const dateToString = useCallback(
    (dateValue: Date | string | null) => {
      if (dateValue === null || dateValue === '') return '';
      if (mode === 'time') {
        return dayjs(dateValue).format('HH:mm');
      } else if (mode === 'date') {
        return dayjs(dateValue).format('L');
      } else {
        return dayjs(dateValue).format();
      }
    },
    [mode]
  );

  const dateValue1 = useMemo(() => stringToDate(value1), [stringToDate, value1]);
  const dateValue2 = useMemo(() => stringToDate(value2), [stringToDate, value2]);

  const onDateChange = useCallback(
    (dateTime: Date | string | null, id: number) => {
      const dateString = dateToString(dateTime);
      if (id === 1) {
        onValueChange(`${dateString}${t('common.ndash')}${value2}`);
      } else {
        onValueChange(`${value1}${t('common.ndash')}${dateString}`);
      }
    },
    [dateToString, onValueChange, value1, value2]
  );
  // console.log(mode);
  // console.log('###%%%', dateValue);
  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          {name && <Text style={styles.title}>{name}</Text>}
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {mode === 'time' && (
              <TimePicker
                value={dateValue1}
                onChange={(date) => onDateChange(date, 1)}
                ampm={false}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'date' && (
              <DatePicker
                inputFormat={LocalizedDateFormatForWeb}
                value={dateValue1}
                onChange={(date) => onDateChange(date, 1)}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'datetime' && (
              <DateTimePicker
                inputFormat={`${LocalizedDateFormatForWeb} HH:mm`}
                ampm={false}
                value={dateValue1}
                onChange={(date) => onDateChange(date, 1)}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
          </LocalizationProvider>
        </View>
        <View style={{ marginTop: 20 }}>
          <Text>{`${t('common.ndash')}`}</Text>
        </View>
        <View style={styles.tr2}>
          {name && <Text style={styles.title}>{name}</Text>}
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {mode === 'time' && (
              <TimePicker
                value={dateValue2}
                onChange={(date) => onDateChange(date, 2)}
                ampm={false}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'date' && (
              <DatePicker
                inputFormat={LocalizedDateFormatForWeb}
                value={dateValue2}
                onChange={(date) => onDateChange(date, 2)}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'datetime' && (
              <DateTimePicker
                inputFormat={`${LocalizedDateFormatForWeb} HH:mm`}
                ampm={false}
                value={dateValue2}
                onChange={(date) => onDateChange(date, 2)}
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
          </LocalizationProvider>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr: {
    flexDirection: 'row',
    height: 70,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    height: 60,
    margin: 5,
  },
});
