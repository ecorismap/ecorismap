import { PhotoType } from '../types';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';

//入力時は文字列を受け取ってtypeに沿った値を返す。
//save時はそれぞれのtypeになっているが、入力後すぐsavedだと文字列
export const formattedInputs = (
  value: string | number | PhotoType[],
  type: string,
  // | FormatType
  // | 'email'
  // | 'latitude-decimal'
  // | 'longitude-decimal'
  // | 'latitude-deg'
  // | 'longitude-deg'
  // | 'longitude-min'
  // | 'latitude-min'
  // | 'min'
  // | 'longitude-sec'
  // | 'latitude-sec'
  // | 'sec'
  // | 'url'
  // | 'password'
  // | 'name'
  // | 'pin'
  // | 'members',

  alert = true
): { isOK: boolean; result: string | number | PhotoType[] } => {
  let result: string | number | PhotoType[];
  let isOK = true;

  if (typeof value !== 'string') return { isOK: false, result: value };
  switch (type) {
    case 'STRING': {
      result = value;
      break;
    }
    case 'LIST': {
      result = value;
      break;
    }
    case 'RADIO': {
      result = value;
      break;
    }
    case 'CHECK': {
      result = value;
      break;
    }
    case 'SERIAL': {
      const pattern = /^\d+$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = parseInt(regMatch[0], 10);
      }
      break;
    }
    case 'INTEGER': {
      const pattern = /^[+-]?\d+$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = parseInt(regMatch[0], 10);
      }
      break;
    }
    case 'DECIMAL': {
      const pattern = /^[+-]?\d+(?:\.\d+)?$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = parseFloat(regMatch[0]);
      }
      break;
    }
    case 'NUMBERRANGE': {
      const splitedValue = value.split(t('common.ndash'));
      const pattern = /^[+-]?\d+(?:\.\d+)?$/g;
      const regMatch0 = splitedValue[0].match(pattern);
      const regMatch1 = splitedValue[1].match(pattern);
      if (regMatch0 === null || regMatch1 === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'DATETIME':
      result = value;
      break;
    case 'DATESTRING':
      result = value;
      break;
    case 'TIMESTRING':
      result = value;
      break;
    case 'TIMERANGE':
      result = value;
      break;
    case 'REFERENCE':
      result = value;
      break;
    case 'TABLE':
      result = value;
      break;
    case 'LISTTABLE':
      result = value;
      break;
    case 'PHOTO': {
      result = value;
      break;
    }
    case 'latitude-decimal': {
      const pattern = /^[-+]?([1-8]?\d(\.\d*)?|90(\.0*)?)$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'longitude-decimal': {
      const pattern = /^[-+]?(180(\.0*)?|((1[0-7]\d)|([1-9]?\d))(\.\d*)?)$/g;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'latitude-deg': {
      const pattern = /^[-+]?([1-8]?\d|90)$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'longitude-deg': {
      const pattern = /^[-+]?(180|((1[0-7]\d)|([1-9]?\d)))$/g;
      const regMatch = value.match(pattern);
      if (regMatch === null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'longitude-min':
    case 'latitude-min':
    case 'min': {
      const pattern = /^([1-5]?\d)$/g;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'longitude-sec':
    case 'latitude-sec':
    case 'sec': {
      const pattern = /^[1-5]?\d(\.\d*)?$/g;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = regMatch[0];
      }
      break;
    }
    case 'url': {
      // eslint-disable-next-line no-useless-escape
      const pattern = /(https?|file):\/\/[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+/g;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'email': {
      const pattern = /^[A-Za-z0-9]{1}[A-Za-z0-9_.+-]*@{1}[A-Za-z0-9_.-]{1,}.[A-Za-z0-9]{1,}$/;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'password': {
      const pattern = /^[a-zA-Z0-9.?/-]{6,24}$/;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'pin': {
      const pattern = /^[0-9]{4}$/;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'name': {
      const pattern = /^[a-zA-Z0-9.?/-]{1,24}$/;
      const regMatch = value.match(pattern);
      if (regMatch == null) {
        isOK = false;
        result = value;
      } else {
        result = value;
      }
      break;
    }
    case 'members': {
      const emails = value.split(',');
      const pattern =
        /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      for (let i = 0; i < emails.length; i++) {
        if (emails[i] !== '' && emails[i].match(pattern) == null) {
          isOK = false;
        }
      }
      result = value;
      break;
    }
    default:
      alert && Alert.alert('', `${t('Format.alert.formattedInputs')} ${type}:${value}`);
      result = value;
      isOK = false;
  }

  return { isOK: isOK, result: result };
};
