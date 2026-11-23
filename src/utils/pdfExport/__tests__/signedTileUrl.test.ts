import { buildSignedTileUrl } from '../signedTileUrl';
import { TileSignaturesType } from '../../TileSignature';

const template = 'https://tiles.example.com/protected/{z}/{x}/{y}.png';
const signatures: TileSignaturesType = {
  [template]: { status: 'signed', query: 'expires=100&sig=abc', expires: 100, checkedAt: 1 },
};

describe('buildSignedTileUrl', () => {
  it('署名付きの地図はタイル URL に署名を付ける', () => {
    expect(buildSignedTileUrl({ url: template, flipY: false }, 15, 1, 2, signatures)).toBe(
      'https://tiles.example.com/protected/15/1/2.png?expires=100&sig=abc'
    );
  });

  it('flipY の地図は Y を反転したうえで署名を付ける', () => {
    expect(buildSignedTileUrl({ url: template, flipY: true }, 2, 1, 0, signatures)).toBe(
      'https://tiles.example.com/protected/2/1/3.png?expires=100&sig=abc'
    );
  });

  it('署名の無い地図・署名が不要な地図はそのまま', () => {
    const plain = 'https://other.example.com/{z}/{x}/{y}.png?key=k';
    expect(buildSignedTileUrl({ url: plain, flipY: false }, 1, 0, 0, signatures)).toBe(
      'https://other.example.com/1/0/0.png?key=k'
    );
    const unsigned: TileSignaturesType = { [template]: { status: 'unsigned', checkedAt: 1 } };
    expect(buildSignedTileUrl({ url: template, flipY: false }, 1, 0, 0, unsigned)).toBe(
      'https://tiles.example.com/protected/1/0/0.png'
    );
  });
});
