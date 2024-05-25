import React, { useContext, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View, Image, StyleSheet, Platform, Text } from 'react-native';
import { Button, SelectionalButton } from '../atoms';
import { HOME_ACCOUNT_BTN, COLOR, FUNC_PROJECT } from '../../constants/AppConstants';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

export const HomeAccountButton = () => {
  const { user, gotoLogin, gotoProjects, gotoAccount, pressLogout } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const [valid, setValid] = useState(true);

  const initial = useMemo(() => {
    if (user.displayName && user.displayName !== '') {
      return user.displayName[0].toUpperCase();
    } else if (user.email && user.email !== null) {
      return user.email[0].toUpperCase();
    } else {
      return '@';
    }
  }, [user]);

  useEffect(() => setValid(true), [user.photoURL]);

  const styles = StyleSheet.create({
    button: {
      elevation: 101,
      marginHorizontal: 0,
      position: 'absolute',
      right: 9,
      top: Platform.OS === 'ios' && !isLandscape ? 40 : 20,
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
      marginBottom: Platform.OS === 'android' ? 5 : 0,
    },
  });
  return (
    <View style={styles.button}>
      {user.uid === undefined ? (
        <Button
          name={HOME_ACCOUNT_BTN.ACCOUNT}
          //color={COLOR.WHITE}
          backgroundColor={COLOR.ALFAORANGE}
          borderColor={COLOR.ORANGE}
          borderWidth={1}
          onPress={gotoLogin}
        />
      ) : (
        <>
          <SelectionalButton selectedButton={'ACCOUNT'} directionRow="column">
            {user.photoURL !== null && valid ? (
              //@ts-ignore
              <TouchableOpacity id="ACCOUNT" name={HOME_ACCOUNT_BTN.ACCOUNT} onPressCustom={() => null}>
                <Image onError={() => setValid(false)} style={styles.icon} source={{ uri: user.photoURL }} />
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
                onPressCustom={gotoProjects}
                tooltipText={t('Home.tooltip.projects')}
                tooltipPosition={{ right: 1 }}
              />
            )}
            <Button
              id="SETTING"
              name={HOME_ACCOUNT_BTN.SETTING}
              backgroundColor={COLOR.ORANGE}
              onPressCustom={gotoAccount}
              tooltipText={t('Home.tooltip.setting')}
              tooltipPosition={{ right: 1 }}
            />
            <Button
              id="LOGOUT"
              name={HOME_ACCOUNT_BTN.LOGOUT}
              backgroundColor={COLOR.ORANGE}
              onPressCustom={pressLogout}
              tooltipText={t('Home.tooltip.logout')}
              tooltipPosition={{ right: 1 }}
            />
          </SelectionalButton>
        </>
      )}
    </View>
  );
};
