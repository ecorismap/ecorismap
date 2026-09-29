import { LayerType, RecordType } from '../../../types';
import { generateHTMLTable } from '../html';

const field: LayerType['field'] = [
  { id: 'f1', name: 'name<1>', format: 'STRING' },
  { id: 'f2', name: 'cmt', format: 'STRING' },
];

const record = (props: Partial<RecordType>): RecordType =>
  ({
    id: 'r',
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords: { latitude: 0, longitude: 0 },
    field: {},
    ...props,
  } as RecordType);

describe('generateHTMLTable', () => {
  it('フィールド名と値をエスケープする', () => {
    const html = generateHTMLTable([record({ field: { 'name<1>': 'A&B <c>', cmt: 'x' } })], field);
    expect(html).toContain('name&lt;1&gt;');
    expect(html).toContain('A&amp;B &lt;c&gt;');
    expect(html).not.toContain('<c>');
  });

  it('未入力の値はundefinedと出さず空欄にする', () => {
    const html = generateHTMLTable([record({ field: { 'name<1>': 'a' } })], field);
    expect(html).not.toContain('undefined');
  });

  it('グループの子レコードは出さない', () => {
    const html = generateHTMLTable(
      [record({ field: { 'name<1>': 'parent' } }), record({ field: { 'name<1>': 'child', _group: 'p1' } })],
      field
    );
    expect(html).toContain('parent');
    expect(html).not.toContain('child');
  });
});
