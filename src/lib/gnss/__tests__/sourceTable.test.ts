import { parseSourceTable } from '../sourceTable';

const TABLE = [
  'SOURCETABLE 200 OK',
  'Content-Type: text/plain',
  '',
  'CAS;rtk2go.com;2101;RTK2go;SNIP;0;USA;0.00;0.00;0.0.0.0;0;http://rtk2go.com',
  'STR;VRS_RTCM32;VRS;RTCM 3.2;1004(1),1012(1);2;GPS+GLO+QZS;JENOBA;JPN;35.00;139.00;1;1;Trimble;none;B;N;9600;',
  'STR;MyBase;Tokyo;RTCM 3.3;1005(10),1074(1);2;GPS+GAL;SNIP;JPN;35.68;139.77;0;0;sNTRIP;none;B;N;0;',
  'NET;SNIP;RTK2go;B;N;http://rtk2go.com;none;none;none',
  'ENDSOURCETABLE',
].join('\r\n');

describe('parseSourceTable', () => {
  it('STR行だけをマウントポイントとして読む', () => {
    const mounts = parseSourceTable(TABLE);
    expect(mounts.map((m) => m.mountpoint)).toEqual(['VRS_RTCM32', 'MyBase']);
  });

  it('GGA送信の要否と位置を読む', () => {
    const [vrs, base] = parseSourceTable(TABLE);
    expect(vrs.requiresGga).toBe(true);
    expect(vrs.format).toBe('RTCM 3.2');
    expect(vrs.navSystem).toBe('GPS+GLO+QZS');
    expect(base.requiresGga).toBe(false);
    expect(base.latitude).toBe(35.68);
    expect(base.longitude).toBe(139.77);
  });

  it('空のテーブルは空配列', () => {
    expect(parseSourceTable('ENDSOURCETABLE')).toEqual([]);
  });
});
