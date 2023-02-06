import { createContext } from 'react';

interface LicensesContextType {
  packageNames: string[];
  pressPackageName: (item: string) => void;
}

export const LicensesContext = createContext({} as LicensesContextType);
