import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, Modal, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
  visibleMinus: boolean;
  visibleReshareKey: boolean;
  enableReshareKey: boolean;
  onChangeText: (name: string, value: string) => void;
  onCheckAdmin: (checked: boolean) => void;
  pressDeleteMember: () => void;
  pressReshareMemberKey: () => void;
}

export const ProjectEditMembers = (props: Props) => {
  const {
    name,
    value,
    editable,
    verified,
    role,
    visibleMinus,
    visibleReshareKey,
    enableReshareKey,
    onCheckAdmin,
    onChangeText,
    pressDeleteMember,
    pressReshareMemberKey,
  } = props;

  // 稀にしか使わない「暗号化キーの再共有」は3点リーダー(⋮)メニューに集約してUIをすっきりさせる。
  const [menuVisible, setMenuVisible] = useState(false);

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

      <View style={[styles.td, { flex: 2 }]}>
        <CheckBox
          disabled={!editable}
          label={t('common.admin')}
          width={100}
          labelAlign={'column'}
          checked={role === 'ADMIN' || role === 'OWNER'}
          onCheck={(checked) => onCheckAdmin(checked)}
        />
      </View>

      <View style={[styles.td, { flex: 1 }]}>
        <Button
          style={{
            backgroundColor: visibleMinus ? COLOR.DARKRED : COLOR.GRAY2,
            padding: 0,
          }}
          disabled={!visibleMinus}
          name="minus"
          size={14}
          onPress={pressDeleteMember}
        />
      </View>

      {/* 3点リーダーは最終列に配置。DEK方式のプロジェクトでのみ表示し、列ズレ防止のため全行同じ幅の枠を確保する。 */}
      {visibleReshareKey && (
        <View style={[styles.td, { flex: 1 }]}>
          <Button
            style={{ backgroundColor: COLOR.TRANSPARENT, padding: 0 }}
            color={enableReshareKey ? COLOR.GRAY3 : COLOR.GRAY2}
            disabled={!enableReshareKey}
            name="dots-vertical"
            size={18}
            onPress={() => setMenuVisible(true)}
          />
          <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
              <View style={styles.menuCard}>
                {!!value && <Text style={styles.menuHeader}>{value.toString()}</Text>}
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    pressReshareMemberKey();
                  }}
                >
                  <MaterialCommunityIcons name="key-change" size={18} color={COLOR.BLUE} />
                  <Text style={styles.menuItemText}>{t('ProjectEdit.label.reshareKey')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
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
          size={14}
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
  menuBackdrop: {
    alignItems: 'center',
    backgroundColor: COLOR.ALFAGRAY,
    flex: 1,
    justifyContent: 'center',
  },
  menuCard: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 8,
    elevation: 5,
    minWidth: 240,
    paddingVertical: 6,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  menuHeader: {
    color: COLOR.GRAY3,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    color: COLOR.TEXT_DARK,
    fontSize: 15,
    marginLeft: 12,
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
