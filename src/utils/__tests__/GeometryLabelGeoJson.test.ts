import { generateGeoJson } from '../Geometry';
import { layers } from '../../__tests__/resources/layer';
import { line_record } from '../../__tests__/resources/record';
import { t } from '../../i18n/config';
import { LayerType } from '../../types';

type LabelFeature = { properties: Record<string, unknown> };

const featuresOf = (geojson: ReturnType<typeof generateGeoJson>) =>
  (geojson as unknown as { features: LabelFeature[] }).features;

describe('generateGeoJson ラベル用プロパティ', () => {
  const lineLayer = layers[1];

  it('labelLayerを渡さなければ従来どおり_label/_labelColorを持たない', () => {
    const [feature] = featuresOf(generateGeoJson(line_record, lineLayer.field, 'LINEEND', 'test'));
    expect(feature.properties).not.toHaveProperty('_label');
    expect(feature.properties).not.toHaveProperty('_labelColor');
  });

  it('LINEENDにgenerateLabelの結果とgetColorの色が入る', () => {
    const [feature] = featuresOf(
      generateGeoJson(line_record, lineLayer.field, 'LINEEND', 'test', undefined, lineLayer)
    );
    expect(feature.properties._label).toBe('mizutani');
    expect(feature.properties._labelColor).toMatch(/^rgba\(/);
  });

  it('カスタムラベルは区切りなしで連結し、個別色はレコードの色を使う', () => {
    const layer: LayerType = {
      ...lineLayer,
      label: t('common.custom'),
      customLabel: 'name|"-"|cmt',
      colorStyle: { ...lineLayer.colorStyle, colorType: 'INDIVIDUAL', fieldName: '_strokeColor' },
    };
    const records = [{ ...line_record[0], field: { ...line_record[0].field, cmt: 'a', _strokeColor: 'rgba(1,2,3,1)' } }];
    const [feature] = featuresOf(generateGeoJson(records, layer.field, 'CENTROID', 'test', undefined, layer));
    expect(feature.properties._label).toBe('mizutani-a');
    expect(feature.properties._labelColor).toBe('rgba(1,2,3,1)');
  });
});
