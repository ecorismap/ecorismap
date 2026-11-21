jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../../lib/firebase/storage', () => ({ fetchPhoto: jest.fn() }));
jest.mock('../zipProgress', () => ({}));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

const { decodeTextBytes } = require('../File.web');

describe('decodeTextBytes', () => {
  it('UTF-8 BOMを取り除くので、BOM付きJSONをそのままJSON.parseできる', () => {
    const bytes = new Uint8Array(Buffer.from('\uFEFF{"type":"FeatureCollection","features":[]}', 'utf-8'));
    const text: string = decodeTextBytes(bytes);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(JSON.parse(text)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('BOMなしUTF-8はそのまま読める', () => {
    expect(decodeTextBytes(new Uint8Array(Buffer.from('名前\n山田', 'utf-8')))).toBe('名前\n山田');
  });
});
