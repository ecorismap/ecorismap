import { LayerType, RecordType, DataType } from '../../types';
import { isPhotoField } from '../Geometry';
import { escapeXml } from '../General';
import { PageLayout } from './geometry';

export const generateScaleBar = (layout: PageLayout) => {
  const { margin, page, scale } = layout;
  const width = (96 / 2.54) * 4;
  const rightScale = (scale.value / 100) * 4;
  const middleScale = rightScale / 2;
  return `
      <svg height="80px" style="position: absolute; left: ${margin.pixel}px; top: ${
        margin.pixel + page.heightPixel - 80
      }px;z-index:2">
       <g>
          <text x="${50 + width / 2}" y="25" font-family="Arial" font-size="20" text-anchor="middle">1:${scale.text}</text>
          <line x1="50" y1="50" x2="${50 + width}" y2="50" stroke="black" stroke-width="2" />
          <line x1="50" y1="45" x2="50" y2="55" stroke="black" stroke-width="2" />
          <line x1="${50 + width / 2}" y1="45" x2="${50 + width / 2}" y2="55" stroke="black" stroke-width="2" />
          <line x1="${50 + width}" y1="45" x2="${50 + width}" y2="55" stroke="black" stroke-width="2" />
          <text x="50" y="70" font-family="Arial" font-size="12" text-anchor="middle">0</text>
          <text x="${50 + width / 2}" y="70" font-family="Arial" font-size="12" text-anchor="middle">${middleScale}</text>
          <text x="${50 + width}" y="70" font-family="Arial" font-size="12" text-anchor="middle">${rightScale}m</text>
       </g>
      </svg>`;
};

export const generateNorthArrow = (layout: PageLayout) => `
      <svg style="position: absolute; left: ${layout.margin.pixel + 5}px; top: ${layout.margin.pixel + 10}px;z-index:2">
        <g>
          <circle cx="50" cy="50" r="25" stroke="black" stroke-width="2" fill="none" />
          <path d="M 50,25 L 33,68 L 50,60 L 67,68 Z" fill="black" />
          <text x="50" y="20" font-family="Arial" font-size="20" text-anchor="middle">N</text>
        </g>
      </svg>`;

const footerLine = (layout: PageLayout, top: number, fontSize: number, text: string) => `
      <div
      style="position: absolute; left: ${layout.margin.pixel}px; top: ${top}px; z-index: 2;  width: ${
        layout.page.widthPixel
      }px; display: flex; align-items: center; justify-content: flex-end;">
      <span style="margin:0 10px;font-family: Arial; font-size: ${fontSize}px; color: black;">${escapeXml(text)}</span>
      </div>`;

export const generateCaptions = (layout: PageLayout, attributionText: string) =>
  footerLine(layout, layout.margin.pixel + layout.page.heightPixel - 20, 12, attributionText);

export const generateComment = (layout: PageLayout, comment: string) =>
  footerLine(layout, layout.margin.pixel + layout.page.heightPixel + 3, 9, comment);

export const generateHTMLTable = (records: RecordType[], field: LayerType['field']) => {
  const cellWidth = 800 / field.length;
  const fontSize = cellWidth > 80 ? 12 : 10;
  const cell = (tag: 'th' | 'td', content: string) =>
    tag === 'th'
      ? `<th style="border: 1px solid black; padding: 10px;background-color: #f2f2f2;font-size:${fontSize}px;"><div style="max-height:45px;max-width:${cellWidth}px;">${content}</div></th>`
      : `<td style="overflow-wrap: break-word;word-wrap: break-word;white-space: normal;border: 1px solid black; padding: 10px;font-size:${fontSize}px;"><div style="max-height:45px;max-width:${cellWidth}px;">${content}</div></td>`;

  let html = '<table style="border: 1px solid black; border-collapse: collapse;">';
  html += '<thead><tr>' + field.map((f) => cell('th', escapeXml(f.name))).join('') + '</tr></thead>';
  html += '<tbody>';
  records.forEach((record) => {
    //グループの子レコードは親の行に含まれるため出さない
    const isGroupParent = record.field._group ? record.field._group === '' : true;
    if (!isGroupParent) return;
    html +=
      '<tr>' +
      field
        .map((f) => {
          const value = record.field[f.name];
          const text = isPhotoField(value) ? value.map((p) => p.name).join(',') : String(value ?? '');
          return cell('td', escapeXml(text));
        })
        .join('') +
      '</tr>';
  });
  html += '</tbody></table>';
  return html;
};

export const generateDataHTML = (dataSet: DataType[], layers: LayerType[]) => {
  let html = `<html><head><style> @page { size: 297mm 210mm;} </style></head>`;
  html += `<body style="width:1123px;height:794px;padding:30px;">`;
  for (const layer of layers) {
    const records = dataSet.filter((d) => d.layerId === layer.id).flatMap((d) => d.data);
    html += `<h1>${escapeXml(layer.name)}</h1>`;
    html += generateHTMLTable(records, layer.field);
    html += '<div style="page-break-after: always;"></div>';
  }
  html += '</body></html>';
  return html;
};
