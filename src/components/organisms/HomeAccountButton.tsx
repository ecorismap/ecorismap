import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View, Image, StyleSheet, Platform, Text } from 'react-native';
import { Button, SelectionalButton } from '../atoms';
import { HOME_ACCOUNT_BTN, COLOR, FUNC_PROJECT } from '../../constants/AppConstants';
import { UserType } from '../../types';

interface Props {
  userInfo: UserType;
  onPressLogin: () => void;
  onPressChangeProject: () => void;
  onPressShowAccount: () => void;
  onPressLogout: () => void;
}

export const HomeAccountButton = (props: Props) => {
  const { userInfo, onPressLogin, onPressChangeProject, onPressShowAccount, onPressLogout } = props;
  const [valid, setValid] = useState(true);

  const initial = useMemo(() => {
    if (userInfo.displayName && userInfo.displayName !== '') {
      return userInfo.displayName[0].toUpperCase();
    } else if (userInfo.email && userInfo.email !== null) {
      return userInfo.email[0].toUpperCase();
    } else {
      return '@';
    }
  }, [userInfo]);

  useEffect(() => setValid(true), [userInfo.photoURL]);

  return (
    <View style={styles.button}>
      {userInfo.uid === undefined ? (
        <Button
          name={HOME_ACCOUNT_BTN.ACCOUNT}
          //color={COLOR.WHITE}
          backgroundColor={COLOR.ALFAORANGE}
          borderColor={COLOR.ORANGE}
          borderWidth={1}
          onPress={onPressLogin}
        />
      ) : (
        <>
          <SelectionalButton selectedButton={'ACCOUNT'} directionRow="column">
            {userInfo.photoURL !== null && valid ? (
              //@ts-ignore
              <TouchableOpacity id="ACCOUNT" name={HOME_ACCOUNT_BTN.ACCOUNT} onPressCustom={() => null}>
                <Image onError={() => setValid(false)} style={styles.icon} source={{ uri: userInfo.photoURL }} />
              </TouchableOpacity>
            ) : (
              //@ts-ignore
              <TouchableOpacity id="ACCOUNT" name={HOME_ACCOUNT_BTN.ACCOUNT} onPressCustom={() => null}>
                <View
                  style={{
                    width: 35,
                    height: 35,
                    borderRadius: 35,
                    backgroundColor: COLOR.ORANGE,
                    //flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={styles.textIcon}>{initial}</Text>
                </View>
              </TouchableOpacity>
            )}
            {FUNC_PROJECT && (
              <Button
                id="PROJECTS"
                name={HOME_ACCOUNT_BTN.PROJECTS}
                backgroundColor={COLOR.ORANGE}
                onPressCustom={onPressChangeProject}
              />
            )}
            <Button
              id="SETTING"
              name={HOME_ACCOUNT_BTN.SETTING}
              backgroundColor={COLOR.ORANGE}
              onPressCustom={onPressShowAccount}
            />
            <Button
              id="LOGOUT"
              name={HOME_ACCOUNT_BTN.LOGOUT}
              backgroundColor={COLOR.ORANGE}
              onPressCustom={onPressLogout}
            />
          </SelectionalButton>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    elevation: 101,
    marginHorizontal: 0,
    position: 'absolute',
    right: 12,
    top: Platform.OS === 'ios' ? 40 : 10,
    zIndex: 101,
  },
  icon: {
    borderRadius: 50,
    height: 35,
    marginBottom: 5,
    width: 35,
  },
  textIcon: {
    color: COLOR.WHITE,
    fontSize: 20,
    fontWeight: 'bold',
  },
});
