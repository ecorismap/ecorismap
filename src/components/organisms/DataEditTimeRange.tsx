import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import DatePicker from 'react-native-date-picker';
import dayjs from '../../i18n/dayjs';
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
  const [open1, setOpen1] = useState(false);
  const [open2, setOpen2] = useState(false);
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');

  useEffect(() => {
    if (value === '') return;
    const splitedValue = value.split(t('common.ndash'));
    setValue1(splitedValue[0]);
    setValue2(splitedValue[1]);
  }, [value]);

  //console.log('###', value);
  const stringToDate = useCallback(
    (stringValue: string) => {
      if (stringValue === '') return new Date();
      if (mode === 'time') {
        return dayjs(`2000/1/1 ${stringValue}`).toDate();
      } else if (mode === 'date') {
        return dayjs(stringValue).toDate();
      } else {
        return dayjs(stringValue).toDate();
      }
    },
    [mode]
  );

  const dateToString = useCallback(
    (dateValue: Date) => {
      if (mode === 'time') {
        return dayjs(dateValue).format('HH:mm');
      } else if (mode === 'date') {
        return dayjs(dateValue).format('L');
      } else {
        return dayjs(dateValue).format('L HH:mm');
      }
    },
    [mode]
  );

  const dateValue1 = useMemo(() => stringToDate(value1), [stringToDate, value1]);
  const dateValue2 = useMemo(() => stringToDate(value2), [stringToDate, value2]);

  const dateValueString1 = useMemo(
    () => (value1 === '' ? '' : dateToString(dateValue1)),
    [dateToString, dateValue1, value1]
  );
  const dateValueString2 = useMemo(
    () => (value2 === '' ? '' : dateToString(dateValue2)),
    [dateToString, dateValue2, value2]
  );

  const onDateChange = useCallback(
    (dateTime: Date, id: number) => {
      const dateString = dateToString(dateTime);
      if (id === 1) {
        onValueChange(`${dateString}${t('common.ndash')}${value2}`);
      } else {
        onValueChange(`${value1}${t('common.ndash')}${dateString}`);
      }
    },
    [dateToString, onValueChange, value1, value2]
  );

  //console.log('###%%%', dateValue);
  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TouchableOpacity style={styles.tr2} onPress={() => setOpen1(true)}>
          {name && <Text style={styles.title}>{name}</Text>}
          <Text style={styles.text}>{dateValueString1}</Text>
          <DatePicker
            modal
            open={open1}
            date={dateValue1}
            theme="light"
            title={null}
            confirmText={'OK'}
            onConfirm={(date) => {
              setOpen1(false);
              onDateChange(date, 1);
            }}
            onCancel={() => {
              setOpen1(false);
            }}
            mode={mode}
            is24hourSource={'locale'}
          />
        </TouchableOpacity>
        <View style={{ marginTop: 20 }}>
          <Text>{`${t('common.ndash')}`}</Text>
        </View>
        <TouchableOpacity style={styles.tr2} onPress={() => setOpen2(true)}>
          {name && <Text style={styles.title}> </Text>}
          <Text style={styles.text}>{dateValueString2}</Text>
          <DatePicker
            modal
            open={open2}
            date={dateValue2}
            theme="light"
            title={null}
            confirmText={'OK'}
            onConfirm={(date) => {
              setOpen2(false);
              onDateChange(date, 2);
            }}
            onCancel={() => {
              setOpen2(false);
            }}
            mode={mode}
            is24hourSource={'locale'}
          />
        </TouchableOpacity>
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
  text: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingLeft: 10,
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...Platform.select({
      ios: {
        lineHeight: 40, // as same as height
      },
      android: {},
    }),
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
