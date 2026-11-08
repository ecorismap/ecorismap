import { findRememberedUsbDevice, usbDeviceToRemember } from '../connection';

const F9P = { deviceId: 1003, name: 'u-blox AG', vendorId: 0x1546, productId: 0x01a9, hasPermission: false };
const FTDI = { deviceId: 1004, name: 'FTDI', vendorId: 0x0403, productId: 0x6015, hasPermission: true };

describe('findRememberedUsbDevice', () => {
  it('抜き差しでdeviceIdが変わっても機種（VID/PID）で前回の受信機を見つける', () => {
    const remembered = usbDeviceToRemember({ ...F9P, deviceId: 2001 });
    expect(findRememberedUsbDevice(remembered, [FTDI, F9P])).toBe(F9P);
  });

  it('前回の受信機が挿さっていなければ見つからない', () => {
    expect(findRememberedUsbDevice(usbDeviceToRemember(F9P), [FTDI])).toBeUndefined();
  });

  it('BLEで覚えている場合はUSB機器から探さない', () => {
    expect(findRememberedUsbDevice({ type: 'ble', address: 'AA:BB', name: 'rx' }, [F9P])).toBeUndefined();
  });
});
