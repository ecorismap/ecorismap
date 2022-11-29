import { formattedInputs } from '../../utils/Format';

describe('formattedInput', () => {
  it('check string value', () => {
    expect(formattedInputs('test', 'STRING')).toStrictEqual({ isOK: true, result: 'test' });
    expect(formattedInputs('123', 'STRING')).toStrictEqual({ isOK: true, result: '123' });
  });
  it('check serial value', () => {
    expect(formattedInputs(123, 'SERIAL')).toStrictEqual({ isOK: true, result: 123 });
    expect(formattedInputs('-1', 'SERIAL')).toStrictEqual({ isOK: false, result: '-1' });
    expect(formattedInputs('123', 'SERIAL')).toStrictEqual({ isOK: true, result: 123 });
    expect(formattedInputs('123a', 'SERIAL')).toStrictEqual({ isOK: false, result: '123a' });
    expect(formattedInputs('', 'SERIAL')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check integer value', () => {
    expect(formattedInputs(123, 'INTEGER')).toStrictEqual({ isOK: true, result: 123 });
    expect(formattedInputs('-1', 'INTEGER')).toStrictEqual({ isOK: true, result: -1 });
    expect(formattedInputs('123', 'INTEGER')).toStrictEqual({ isOK: true, result: 123 });
    expect(formattedInputs('123a', 'INTEGER')).toStrictEqual({ isOK: false, result: '123a' });
    expect(formattedInputs('', 'INTEGER')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check decimal value', () => {
    expect(formattedInputs(123.5, 'DECIMAL')).toStrictEqual({ isOK: true, result: 123.5 });
    expect(formattedInputs('-1.1', 'DECIMAL')).toStrictEqual({ isOK: true, result: -1.1 });
    expect(formattedInputs('123.0', 'DECIMAL')).toStrictEqual({ isOK: true, result: 123 });
    expect(formattedInputs('123a', 'DECIMAL')).toStrictEqual({ isOK: false, result: '123a' });
    expect(formattedInputs('', 'DECIMAL')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check url value', () => {
    expect(formattedInputs('https://map.ecoris.info/tiles/{z}/{x}/{y}.png', 'url')).toStrictEqual({
      isOK: true,
      result: 'https://map.ecoris.info/tiles/{z}/{x}/{y}.png',
    });
    expect(formattedInputs('test://abc.def', 'url')).toStrictEqual({ isOK: false, result: 'test://abc.def' });
  });
  it('check email value', () => {
    expect(formattedInputs('test@ecoris.co.jp', 'email')).toStrictEqual({ isOK: true, result: 'test@ecoris.co.jp' });
    expect(formattedInputs('test', 'email')).toStrictEqual({ isOK: false, result: 'test' });
  });
  it('check name value', () => {
    expect(formattedInputs('test123', 'name')).toStrictEqual({ isOK: true, result: 'test123' });
    expect(formattedInputs('a', 'name')).toStrictEqual({ isOK: true, result: 'a' });
    expect(formattedInputs('', 'name')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check password value', () => {
    expect(formattedInputs('pass123', 'password')).toStrictEqual({ isOK: true, result: 'pass123' });
    expect(formattedInputs('short', 'password')).toStrictEqual({ isOK: false, result: 'short' });
    expect(formattedInputs('long123456789long123456789', 'password')).toStrictEqual({
      isOK: false,
      result: 'long123456789long123456789',
    });
  });
  it('check members value', () => {
    expect(formattedInputs('test1@ecoris.co.jp', 'members')).toStrictEqual({
      isOK: true,
      result: 'test1@ecoris.co.jp',
    });
    expect(formattedInputs('test1@ecoris.co.jp,test2@ecoris.co.jp', 'members')).toStrictEqual({
      isOK: true,
      result: 'test1@ecoris.co.jp,test2@ecoris.co.jp',
    });
    expect(formattedInputs('test', 'members')).toStrictEqual({ isOK: false, result: 'test' });
  });

  it('check latitude-decimal value', () => {
    expect(formattedInputs('135.12345', 'latitude-decimal')).toStrictEqual({ isOK: false, result: '135.12345' });
    expect(formattedInputs('35.12345', 'latitude-decimal')).toStrictEqual({ isOK: true, result: '35.12345' });
    expect(formattedInputs('-35.5', 'latitude-decimal')).toStrictEqual({ isOK: true, result: '-35.5' });
    expect(formattedInputs('', 'latitude-decimal')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check longitude-decimal value', () => {
    expect(formattedInputs('135.12345', 'longitude-decimal')).toStrictEqual({ isOK: true, result: '135.12345' });
    expect(formattedInputs('-135.12345', 'longitude-decimal')).toStrictEqual({ isOK: true, result: '-135.12345' });
    expect(formattedInputs('35.5', 'longitude-decimal')).toStrictEqual({ isOK: true, result: '35.5' });
    expect(formattedInputs('', 'latitude-decimal')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check latitude-deg value', () => {
    expect(formattedInputs('135', 'latitude-deg')).toStrictEqual({ isOK: false, result: '135' });
    expect(formattedInputs('35', 'latitude-deg')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'latitude-deg')).toStrictEqual({ isOK: true, result: '-35' });
    expect(formattedInputs('35.5', 'latitude-deg')).toStrictEqual({ isOK: false, result: '35.5' });
    expect(formattedInputs('', 'latitude-deg')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check latitude-min value', () => {
    expect(formattedInputs('70', 'latitude-min')).toStrictEqual({ isOK: false, result: '70' });
    expect(formattedInputs('35', 'latitude-min')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'latitude-min')).toStrictEqual({ isOK: false, result: '-35' });
    expect(formattedInputs('35.5', 'latitude-min')).toStrictEqual({ isOK: false, result: '35.5' });
    expect(formattedInputs('', 'latitude-min')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check latitude-sec value', () => {
    expect(formattedInputs('70', 'latitude-sec')).toStrictEqual({ isOK: false, result: '70' });
    expect(formattedInputs('35', 'latitude-sec')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'latitude-sec')).toStrictEqual({ isOK: false, result: '-35' });
    expect(formattedInputs('35.5', 'latitude-sec')).toStrictEqual({ isOK: true, result: '35.5' });
    expect(formattedInputs('', 'latitude-sec')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check longitude-deg value', () => {
    expect(formattedInputs('135', 'longitude-deg')).toStrictEqual({ isOK: true, result: '135' });
    expect(formattedInputs('35', 'longitude-deg')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'longitude-deg')).toStrictEqual({ isOK: true, result: '-35' });
    expect(formattedInputs('35.5', 'longitude-deg')).toStrictEqual({ isOK: false, result: '35.5' });
    expect(formattedInputs('', 'longitude-deg')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check longitude-min value', () => {
    expect(formattedInputs('70', 'longitude-min')).toStrictEqual({ isOK: false, result: '70' });
    expect(formattedInputs('35', 'longitude-min')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'longitude-min')).toStrictEqual({ isOK: false, result: '-35' });
    expect(formattedInputs('35.5', 'longitude-min')).toStrictEqual({ isOK: false, result: '35.5' });
    expect(formattedInputs('', 'longitude-min')).toStrictEqual({ isOK: false, result: '' });
  });
  it('check longitude-sec value', () => {
    expect(formattedInputs('70', 'longitude-sec')).toStrictEqual({ isOK: false, result: '70' });
    expect(formattedInputs('35', 'longitude-sec')).toStrictEqual({ isOK: true, result: '35' });
    expect(formattedInputs('-35', 'longitude-sec')).toStrictEqual({ isOK: false, result: '-35' });
    expect(formattedInputs('35.5', 'longitude-sec')).toStrictEqual({ isOK: true, result: '35.5' });
    expect(formattedInputs('', 'longitude-sec')).toStrictEqual({ isOK: false, result: '' });
  });
});
