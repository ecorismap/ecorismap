import { formattedInputs } from '../Format';

describe('Format', () => {
  describe('formattedInputs', () => {
    it('formats email correctly', () => {
      expect(formattedInputs('test@example.com', 'email', false)).toEqual({
        isOK: true,
        result: 'test@example.com',
      });
      expect(formattedInputs('invalid-email', 'email', false)).toEqual({
        isOK: false,
        result: 'invalid-email',
      });
    });

    it('formats INTEGER correctly', () => {
      expect(formattedInputs('123', 'INTEGER', false)).toEqual({
        isOK: true,
        result: 123,
      });
      expect(formattedInputs('abc', 'INTEGER', false)).toEqual({
        isOK: false,
        result: 'abc',
      });
      expect(formattedInputs('', 'INTEGER', false)).toEqual({
        isOK: true,
        result: '',
      });
    });

    it('formats DECIMAL correctly', () => {
      expect(formattedInputs('123.45', 'DECIMAL', false)).toEqual({
        isOK: true,
        result: 123.45,
      });
      expect(formattedInputs('abc', 'DECIMAL', false)).toEqual({
        isOK: false,
        result: 'abc',
      });
      expect(formattedInputs('', 'DECIMAL', false)).toEqual({
        isOK: true,
        result: '',
      });
    });

    it('formats SERIAL correctly', () => {
      expect(formattedInputs('123', 'SERIAL', false)).toEqual({
        isOK: true,
        result: 123,
      });
      expect(formattedInputs('abc', 'SERIAL', false)).toEqual({
        isOK: false,
        result: 'abc',
      });
    });

    it('formats STRING correctly', () => {
      expect(formattedInputs('test', 'STRING', false)).toEqual({
        isOK: true,
        result: 'test',
      });
    });

    it('formats STRING_MULTI correctly', () => {
      expect(formattedInputs('test\nmultiline', 'STRING_MULTI', false)).toEqual({
        isOK: true,
        result: 'test\nmultiline',
      });
    });

    it('formats STRING_DICTIONARY correctly', () => {
      expect(formattedInputs('test', 'STRING_DICTIONARY', false)).toEqual({
        isOK: true,
        result: 'test',
      });
    });

    it('formats LIST correctly', () => {
      expect(formattedInputs('item1,item2', 'LIST', false)).toEqual({
        isOK: true,
        result: 'item1,item2',
      });
    });

    it('formats RADIO correctly', () => {
      expect(formattedInputs('option1', 'RADIO', false)).toEqual({
        isOK: true,
        result: 'option1',
      });
    });

    it('formats CHECK correctly', () => {
      expect(formattedInputs('true', 'CHECK', false)).toEqual({
        isOK: true,
        result: 'true',
      });
    });

    it('formats NUMBERRANGE correctly', () => {
      expect(formattedInputs('1-10', 'NUMBERRANGE', false)).toEqual({
        isOK: true,
        result: '1-10',
      });
    });

    it('formats DATETIME correctly', () => {
      expect(formattedInputs('2023-01-01 12:34:56', 'DATETIME', false)).toEqual({
        isOK: true,
        result: '2023-01-01 12:34:56',
      });
    });

    it('formats DATESTRING correctly', () => {
      expect(formattedInputs('2023-01-01', 'DATESTRING', false)).toEqual({
        isOK: true,
        result: '2023-01-01',
      });
    });

    it('formats TIMESTRING correctly', () => {
      expect(formattedInputs('12:34:56', 'TIMESTRING', false)).toEqual({
        isOK: true,
        result: '12:34:56',
      });
    });

    it('formats TIMERANGE correctly', () => {
      expect(formattedInputs('12:00-13:00', 'TIMERANGE', false)).toEqual({
        isOK: true,
        result: '12:00-13:00',
      });
    });

    it('formats REFERENCE correctly', () => {
      expect(formattedInputs('ref1', 'REFERENCE', false)).toEqual({
        isOK: true,
        result: 'ref1',
      });
    });

    it('formats TABLE correctly', () => {
      expect(formattedInputs('table1', 'TABLE', false)).toEqual({
        isOK: true,
        result: 'table1',
      });
    });

    it('formats LISTTABLE correctly', () => {
      expect(formattedInputs('listtable1', 'LISTTABLE', false)).toEqual({
        isOK: true,
        result: 'listtable1',
      });
    });

    it('formats PHOTO correctly', () => {
      expect(formattedInputs('photo1', 'PHOTO', false)).toEqual({
        isOK: true,
        result: 'photo1',
      });
    });

    it('formats latitude-decimal correctly', () => {
      expect(formattedInputs('35.123', 'latitude-decimal', false)).toEqual({
        isOK: true,
        result: '35.123',
      });
      expect(formattedInputs('91.0', 'latitude-decimal', false)).toEqual({
        isOK: false,
        result: '91.0',
      });
    });

    it('formats longitude-decimal correctly', () => {
      expect(formattedInputs('135.123', 'longitude-decimal', false)).toEqual({
        isOK: true,
        result: '135.123',
      });
      expect(formattedInputs('181.0', 'longitude-decimal', false)).toEqual({
        isOK: false,
        result: '181.0',
      });
    });

    it('formats latitude-deg correctly', () => {
      expect(formattedInputs('35', 'latitude-deg', false)).toEqual({
        isOK: true,
        result: '35',
      });
      expect(formattedInputs('91', 'latitude-deg', false)).toEqual({
        isOK: false,
        result: '91',
      });
    });

    it('formats longitude-deg correctly', () => {
      expect(formattedInputs('135', 'longitude-deg', false)).toEqual({
        isOK: true,
        result: '135',
      });
      expect(formattedInputs('181', 'longitude-deg', false)).toEqual({
        isOK: false,
        result: '181',
      });
    });

    it('formats min correctly', () => {
      expect(formattedInputs('30', 'min', false)).toEqual({
        isOK: true,
        result: '30',
      });
      expect(formattedInputs('60', 'min', false)).toEqual({
        isOK: false,
        result: '60',
      });
    });

    it('formats sec correctly', () => {
      expect(formattedInputs('30.5', 'sec', false)).toEqual({
        isOK: true,
        result: '30.5',
      });
      expect(formattedInputs('60', 'sec', false)).toEqual({
        isOK: false,
        result: '60',
      });
    });

    it('formats url correctly', () => {
      expect(formattedInputs('https://example.com', 'url', false)).toEqual({
        isOK: true,
        result: 'https://example.com',
      });
      expect(formattedInputs('invalid-url', 'url', false)).toEqual({
        isOK: false,
        result: 'invalid-url',
      });
    });

    it('formats password correctly', () => {
      expect(formattedInputs('password123', 'password', false)).toEqual({
        isOK: true,
        result: 'password123',
      });
      expect(formattedInputs('pw', 'password', false)).toEqual({
        isOK: false,
        result: 'pw',
      });
    });

    it('formats pin correctly', () => {
      expect(formattedInputs('1234', 'pin', false)).toEqual({
        isOK: true,
        result: '1234',
      });
      expect(formattedInputs('123', 'pin', false)).toEqual({
        isOK: false,
        result: '123',
      });
    });

    it('formats name correctly', () => {
      expect(formattedInputs('username123', 'name', false)).toEqual({
        isOK: true,
        result: 'username123',
      });
      expect(formattedInputs('ユーザー名', 'name', false)).toEqual({
        isOK: false,
        result: 'ユーザー名',
      });
    });

    it('formats members correctly', () => {
      expect(formattedInputs('user1@example.com,user2@example.com', 'members', false)).toEqual({
        isOK: true,
        result: 'user1@example.com,user2@example.com',
      });
      expect(formattedInputs('user1@example.com,invalid-email', 'members', false)).toEqual({
        isOK: false,
        result: 'user1@example.com,invalid-email',
      });
    });

    it('returns input with isOK: false for unknown format', () => {
      expect(formattedInputs('test', 'unknown' as any, false)).toEqual({
        isOK: false,
        result: 'test',
      });
    });

    it('handles array input', () => {
      const photoArray = [
        {
          id: '1',
          name: 'photo1',
          uri: 'uri1',
          url: 'url1',
          width: 100,
          height: 100,
          thumbnail: 'thumb1',
          key: 'key1',
        },
      ];
      expect(formattedInputs(photoArray as any, 'PHOTO', false)).toEqual({
        isOK: true,
        result: photoArray,
      });
    });
  });
});
