import React, { useCallback } from 'react';
import { Linking } from 'react-native';
import Licenses from '../components/pages/Licenses';
import { LicensesContext } from '../contexts/Licenses';
import licenseFile from '../licenses.json';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';

export default function LicensesContainers() {
  const { goBack } = useBottomSheetNavigation();
  const packageNames = Object.keys(licenseFile);

  const pressPackageName = useCallback((packageName: string) => {
    //@ts-ignore
    const url = licenseFile[packageName].licenseUrl;
    Linking.openURL(url);
  }, []);

  const gotoBack = useCallback(() => {
    goBack();
  }, [goBack]);

  return (
    <LicensesContext.Provider value={{ packageNames, pressPackageName, gotoBack }}>
      <Licenses />
    </LicensesContext.Provider>
  );
}
