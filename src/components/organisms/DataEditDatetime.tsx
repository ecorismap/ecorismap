import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import DatePicker from 'react-native-date-picker';
import dayjs from '../../i18n/dayjs';

interface Props {
  name: string;
  value: string;
  editable?: boolean;
  mode: 'date' | 'time' | 'datetime';
  onValueChange: (value: string) => void;
}

export const DataEditDatetime = (props: Props) => {
  const { name, value, mode, onValueChange } = props;
  const [open, setOpen] = useState(false);

  //console.log('###', value);
  const dateValue = useMemo(() => {
    if (value === '') return new Date();
    if (mode === 'time') {
      return dayjs(`2000/1/1 ${value}`).toDate();
    } else if (mode === 'date') {
      return dayjs(value).toDate();
    } else {
      return dayjs(value).toDate();
    }
  }, [mode, value]);

  //console.log('$$$', dateValue);

  const dateValueString = useMemo(() => {
    if (value === '') return '';
    if (mode === 'time') {
      return dayjs(dateValue).format('HH:mm');
    } else if (mode === 'date') {
      return dayjs(dateValue).format('L');
    } else {
      return dayjs(dateValue).format('L HH:mm');
    }
  }, [dateValue, mode, value]);

  const onDateChange = useCallback(
    (dateTime: Date) => {
      let dateString: string;
      if (mode === 'time') {
        dateString = dayjs(dateTime).format('HH:mm');
      } else if (mode === 'date') {
        dateString = dayjs(dateTime).format('L');
      } else {
        dateString = dayjs(dateTime).format('L HH:mm');
      }
      onValueChange(dateString);
    },
    [mode, onValueChange]
  );
  //console.log('###%%%', dateValue);
  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TouchableOpacity style={styles.tr2} onPress={() => setOpen(true)}>
          {name && <Text style={styles.title}>{name}</Text>}
          <Text style={styles.text}>{dateValueString}</Text>
          <DatePicker
            modal
            open={open}
            date={dateValue}
            title={null}
            textColor={COLOR.BLACK}
            confirmText={'OK'}
            onConfirm={(date) => {
              setOpen(false);
              onDateChange(date);
            }}
            onCancel={() => {
              setOpen(false);
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
