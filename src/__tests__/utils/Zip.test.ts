import { gzip, unzip } from '../../utils/Zip';

const str = `あいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえお`;
describe('gzip', () => {
  it('return zip value from string', () => {
    expect(gzip(str)).toBe('eJx73Nj0uLHlcWPb48aOx41dj4c+FwBRi4X9');
  });
});

describe('unzip', () => {
  it('return unzip string from zip value', () => {
    expect(unzip('eJx73Nj0uLHlcWPb48aOx41dj4c+FwBRi4X9')).toBe(str);
  });
});
