import React from 'react';
import { View, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { RoleType } from '../../types';
import { CheckBox } from '../molecules/CheckBox';
import { t } from '../../i18n/config';

interface Props {
  name: string;
  value: string | number | undefined;
  editable: boolean;
  verified: 'OK' | 'HOLD' | 'NO_ACCOUNT';
  role: RoleType;
  visiblePlus: boolean;
  visibleMinus: boolean;
  onChangeText: (name: string, value: string) => void;
  onCheckAdmin: (checked: boolean) => void;
  pressAddMember: () => void;
  pressDeleteMember: () => void;
}

export const ProjectEditMembers = (props: Props) => {
  const {
    name,
    value,
    editable,
    verified,
    role,
    visiblePlus,
    visibleMinus,
    onCheckAdmin,
    onChangeText,
    pressAddMember,
    pressDeleteMember,
  } = props;

  return (
    <View style={styles.tr}>
      <View style={[styles.td, { flex: 12 }]}>
        <MemberTextInput
          style={styles.input}
          label={name}
          verified={verified}
          value={value ? value.toString() : ''}
          onChangeText={onChangeText}
          editable={editable}
        />
      </View>

      <View style={[styles.td, { flex: 3 }]}>
        <CheckBox
          disabled={!editable}
          label={t('common.admin')}
          width={100}
          labelAlign={'column'}
          checked={role === 'ADMIN' || role === 'OWNER'}
          onCheck={(checked) => onCheckAdmin(checked)}
        />
      </View>

      {visibleMinus && (
        <View style={[styles.td, { flex: 1 }]}>
          <Button
            style={{
              backgroundColor: COLOR.DARKRED,
              padding: 0,
            }}
            name="minus"
            onPress={pressDeleteMember}
          />
        </View>
      )}
      {visiblePlus && (
        <View style={[styles.td, { flex: 1 }]}>
          <Button
            style={{
              backgroundColor: COLOR.GRAY3,
              padding: 0,
            }}
            name="plus"
            onPress={pressAddMember}
          />
        </View>
      )}
    </View>
  );
};

const MemberTextInput = React.memo((props: any) => {
  const { label, verified } = props;
  return (
    <View style={styles.tr2}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.title}>{label}</Text>
        <Button
          style={{
            backgroundColor: verified === 'OK' ? COLOR.GREEN : verified === 'HOLD' ? COLOR.ORANGE : COLOR.RED,
            padding: 0,
          }}
          disabled={true}
          name={verified ? 'account-check' : 'account-alert'}
        />
      </View>
      <TextInput {...props} />
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
  },
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
    //flex: 1,
    fontSize: 12,
    marginRight: 10,
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
