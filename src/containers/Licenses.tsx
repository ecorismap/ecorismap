import React, { useCallback } from 'react';
import { Linking } from 'react-native';
import Licenses from '../components/pages/Licenses';
import { LicensesContext } from '../contexts/Licenses';
import licenseFile from '../licenses.json';

export default function LicensesContainers() {
  const packageNames = Object.keys(licenseFile);

  const pressPackageName = useCallback((packageName) => {
    //@ts-ignore
    const url = licenseFile[packageName].licenseUrl;
    Linking.openURL(url);
  }, []);

  return (
    <LicensesContext.Provider value={{ packageNames, pressPackageName }}>
      <Licenses />
    </LicensesContext.Provider>
  );
}
