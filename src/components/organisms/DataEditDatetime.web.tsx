import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import TextField from '@mui/material/TextField';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { LocalizedDateFormatForWeb } from '../../i18n/dayjs';

interface Props {
  name: string;
  value: string;
  editable?: boolean;
  mode: 'date' | 'time' | 'datetime';
  onValueChange: (value: string) => void;
}

export const DataEditDatetime = (props: Props) => {
  const { name, value, mode, onValueChange } = props;

  //console.log('###', value);
  const dateValue = useMemo(() => {
    if (value === '') return null;
    if (mode === 'time') {
      return new Date(`2000/1/1 ${value}`);
    } else if (mode === 'date') {
      return new Date(value);
    } else {
      return new Date(value);
    }
  }, [mode, value]);

  const onDateChange = useCallback(
    (dateTime: Date | null) => {
      let dateString: string;
      if (dateTime === null) return;
      if (mode === 'time') {
        dateString = dayjs(dateTime).format('HH:mm');
      } else if (mode === 'date') {
        dateString = dayjs(dateTime).format('L');
      } else {
        dateString = dayjs(dateTime).format();
      }
      onValueChange(dateString);
    },
    [mode, onValueChange]
  );
  // console.log(mode);
  //console.log('###%%%', dateValue);
  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          {name && <Text style={styles.title}>{name}</Text>}
          {/* @ts-ignore */}
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {mode === 'time' && (
              // @ts-ignore
              <TimePicker
                value={dateValue}
                onChange={onDateChange}
                ampm={false}
                // @ts-ignore
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'date' && (
              // @ts-ignore
              <DatePicker
                inputFormat={LocalizedDateFormatForWeb}
                value={dateValue}
                onChange={onDateChange}
                // @ts-ignore
                renderInput={(params) => <TextField size="small" {...params} />}
              />
            )}
            {mode === 'datetime' && (
              // @ts-ignore
              <DateTimePicker
                disableMaskedInput
                inputFormat={`${LocalizedDateFormatForWeb} HH:mm`}
                ampm={false}
                value={dateValue}
                onChange={onDateChange}
                // @ts-ignore
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
