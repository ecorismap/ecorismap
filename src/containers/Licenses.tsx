import React, { useCallback } from 'react';
import { Props_Licenses } from '../routes';
import { Linking } from 'react-native';
import Licenses from '../components/pages/Licenses';
import licenseFile from '../licenses.json';

export default function LicensesContainers({}: Props_Licenses) {
  const packageNames = Object.keys(licenseFile);

  const pressPackageName = useCallback((packageName) => {
    //@ts-ignore
    const url = licenseFile[packageName].licenseUrl;
    Linking.openURL(url);
  }, []);

  return <Licenses packageNames={packageNames} pressPackageName={pressPackageName} />;
}
