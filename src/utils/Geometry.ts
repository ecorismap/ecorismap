import { XMLParser } from 'fast-xml-parser';
import { ulid } from 'ulid';
import xmlBuilder from 'xmlbuilder';
import {
  RecordType,
  FeatureType,
  LayerType,
  LocationType,
  GeoJsonFeatureType,
  PhotoType,
  FormatType,
  FieldType,
} from '../types';
import * as turf from '@turf/helpers';
import simplify from '@turf/simplify';
import { COLOR } from '../constants/AppConstants';
import dayjs from '../i18n/dayjs';
import sanitize from 'sanitize-filename';
import { formattedInputs } from './Format';
import { calcCentroid, calcLineMidPoint, latlonToLatLonObject } from './Coords';
import {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  GeoJsonProperties,
  Geometry,
  Position,
} from 'geojson';
import { rgbaString2qgis } from './Color';
import { cloneDeep } from 'lodash';
import { isLocationType, isLocationTypeArray } from './General';
import { generateLabel, getColor } from './Layer';

export const getGeometryType = (geometryString: string): FeatureType => {
  if (geometryString.includes('POINT')) {
    return 'POINT';
  } else if (geometryString.includes('LINESTRING')) {
    return 'LINE';
  } else if (geometryString.includes('POLYGON')) {
    return 'POLYGON';
  } else {
    return 'NONE';
  }
};
export const detectCsvType = (csv: string): { type: FeatureType; column: number } => {
  const csvFields = csv.split('\n')[0].split(',');
  const geometryColumn = csvFields.findIndex((field) => field === 'geometry');
  if (geometryColumn === -1) {
    return { type: 'NONE', column: -1 };
  } else {
    const firstRowGeometry = csv.split('\n')[1].split(',')[geometryColumn];
    const geometryType = getGeometryType(firstRowGeometry);
    return { type: geometryType, column: geometryColumn };
  }
};

function parseCSVLine(line: string) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされた引用符
        current += char;
        i++; // 次の文字をスキップ
      } else {
        // 引用符の開始または終了
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // フィールドの区切り
      result.push(current.trim());
      current = '';
    } else {
      // 通常の文字
      current += char;
    }
  }

  // 最後のフィールドを追加
  result.push(current.trim());

  return result;
}

export const Csv2Data = (
  csv: string,
  fileName: string,
  userId: string | undefined,
  displayName: string | null,
  importedLayer?: LayerType
) => {
  try {
    //console.log(type);
    const { type, column } = detectCsvType(csv);
    const layer = importedLayer === undefined ? createLayerFromCsv(csv, fileName, type) : cloneDeep(importedLayer);
    const header = csv.split('\n')[0].split(',');
    const body = csv.split('\n').slice(1);
    const offset = header[0].includes('displayName') ? 1 : 0;

    const importedData: RecordType[] = body.map((line) => {
      //カンマで区切るが""で囲まれた,は残す。最初と最後の"を削除
      const data = parseCSVLine(line);

      //layer.fieldとdataの配列からfieldを作成
      const fields = layer.field
        .map((field, idx) => {
          return { [field.name]: data[idx + offset] };
        })
        .reduce((obj, userObj) => Object.assign(obj, userObj), {});
      let coords;
      if (type === 'POINT') {
        const geometryType = getGeometryType(data[column]);
        if (geometryType !== 'POINT') {
          coords = undefined;
        } else {
          const geometry = data[column].replace('POINT(', '').replace(')', '').split(' ');
          const { isOK: latIsOK, result: lat } = formattedInputs(geometry[1], 'latitude-decimal', false);
          const { isOK: lonIsOK, result: lon } = formattedInputs(geometry[0], 'longitude-decimal', false);
          coords = {
            latitude: latIsOK ? Number(lat as string) : 0,
            longitude: lonIsOK ? Number(lon as string) : 0,
          };
        }
      } else if (type === 'LINE') {
        const geometryType = getGeometryType(data[column]);
        if (geometryType !== 'LINE') {
          coords = undefined;
        } else {
          const geometry = data[column].replace('LINESTRING(', '').replace(')', '').split(',');
          coords = geometry.map((xy) => {
            const [lon, lat] = xy.split(' ');
            const { isOK: latIsOK, result: latResult } = formattedInputs(lat, 'latitude-decimal', false);
            const { isOK: lonIsOK, result: lonResult } = formattedInputs(lon, 'longitude-decimal', false);
            return {
              latitude: latIsOK ? Number(latResult as string) : 0,
              longitude: lonIsOK ? Number(lonResult as string) : 0,
            };
          });
        }
      } else if (type === 'POLYGON') {
        const geometryType = getGeometryType(data[column]);
        if (geometryType !== 'POLYGON') {
          coords = undefined;
        } else {
          const geometry = data[column].replace('POLYGON((', '').replace('))', '').split(',');
          const polygon = geometry.map((xy) => {
            const [lon, lat] = xy.split(' ');
            const { isOK: latIsOK, result: latResult } = formattedInputs(lat, 'latitude-decimal', false);
            const { isOK: lonIsOK, result: lonResult } = formattedInputs(lon, 'longitude-decimal', false);
            return {
              latitude: latIsOK ? Number(latResult as string) : 0,
              longitude: lonIsOK ? Number(lonResult as string) : 0,
            };
          });
          coords = polygon;
        }
      } else {
        coords = undefined;
      }

      return {
        id: ulid(),
        userId: userId,
        displayName: displayName,
        redraw: false,
        visible: true,
        coords: coords,
        field: fields,
      };
    });
    //csvから
    return { layer: layer, recordSet: importedData };
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

export const Gpx2Data = (
  gpx: string,
  type: FeatureType,
  fileName: string,
  userId: string | undefined,
  displayName: string | null
) => {
  try {
    //console.log(type);
    const newLayer: LayerType = createGpxLayer(fileName, type);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    const json = parser.parse(gpx);
    //console.log(json);
    const gpxkey = json.gpx ? 'gpx' : 'GPX';
    //console.log(gpxkey);
    let importedData: RecordType[] = [];

    switch (type) {
      case 'POINT':
        const wpts = json[gpxkey].wpt ? (Array.isArray(json[gpxkey].wpt) ? json[gpxkey].wpt : [json[gpxkey].wpt]) : [];
        importedData = wpts.map((d: any) => {
          const { isOK: latIsOK, result: lat } = formattedInputs(d.lat, 'latitude-decimal', false);
          const { isOK: lonIsOK, result: lon } = formattedInputs(d.lon, 'longitude-decimal', false);
          const time = dayjs(d.time);
          const ele = isNaN(d.ele) || d.ele === '' ? undefined : d.ele;
          const record: RecordType = {
            id: ulid(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
            coords: {
              latitude: latIsOK ? Number(lat as string) : 0,
              longitude: lonIsOK ? Number(lon as string) : 0,
              ele: ele,
            },
            field: {
              name: d.name ? d.name : '',
              time: time.isValid() ? time.format() : '',
              cmt: d.cmt ? d.cmt : '',
            },
          };
          return record;
        });

        //console.log(importedData);
        break;
      case 'LINE': {
        const trks = json[gpxkey].trk ? (Array.isArray(json[gpxkey].trk) ? json[gpxkey].trk : [json[gpxkey].trk]) : [];

        importedData = trks.map((trk: any) => {
          const trksegs = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];
          //console.log(trksegs[0]);
          const coords: LocationType[] = trksegs
            .map((trackseg: any) =>
              trackseg.trkpt.map((trkpt: any) => {
                const { isOK: latIsOK, result: lat } = formattedInputs(trkpt.lat, 'latitude-decimal', false);
                const { isOK: lonIsOK, result: lon } = formattedInputs(trkpt.lon, 'longitude-decimal', false);

                const time = dayjs(trkpt.time);
                const ele = isNaN(trkpt.ele) || trkpt.ele === '' ? undefined : trkpt.ele;
                return {
                  latitude: latIsOK ? Number(lat as string) : 0,
                  longitude: lonIsOK ? Number(lon as string) : 0,
                  timestamp: trkpt.time !== undefined && time.isValid() ? time.valueOf() : undefined,
                  ele: ele,
                };
              })
            )
            .flat();
          //console.log(coords[0]);
          //トラックの最初のポイントの時間をtimeとする。trk.timeは無い場合があるため。
          const firstTrkptTime = trksegs[0]?.trkpt[0]?.time;
          const time = trk.time !== undefined ? dayjs(trk.time) : dayjs(firstTrkptTime);

          const record: RecordType = {
            id: ulid(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
            coords: coords,
            centroid: calcLineMidPoint(coords),
            field: {
              name: trk.name ? trk.name : '',
              time: firstTrkptTime !== undefined && time.isValid() ? time.format() : '',
              cmt: trk.cmt ? trk.cmt : '',
            },
          };
          //console.log('%%%', trk);
          return record;
        });
        break;
      }
      case 'POLYGON':
        break;
    }
    //console.log(importedData.map((n) => n.name));
    return { layer: newLayer, recordSet: importedData };
  } catch (e) {
    return undefined;
  }
};

function isWGS84(geojson: any) {
  // crsプロパティが存在しない場合、デフォルトでWGS84とみなす
  if (!geojson.crs) {
    return true;
  }

  // crsプロパティが存在する場合、WGS84かどうかをチェック
  if (geojson.crs.type === 'name') {
    // OGC CRS URNs
    if (
      geojson.crs.properties.name === 'urn:ogc:def:crs:OGC:1.3:CRS84' ||
      geojson.crs.properties.name === 'urn:ogc:def:crs:OGC:2:84'
    ) {
      return true;
    }
    // EPSG コード
    if (geojson.crs.properties.name === 'EPSG:4326') {
      return true;
    }
  } else if (geojson.crs.type === 'EPSG') {
    // 古い形式のEPSG指定
    if (geojson.crs.properties.code === 4326) {
      return true;
    }
  }

  // 上記のいずれにも該当しない場合、WGS84ではないとみなす
  return false;
}

// GeoJSONオブジェクト全体をチェックする関数
function checkGeoJSONCRS(geojson: any) {
  if (typeof geojson !== 'object' || geojson === null) {
    return false;
  }

  // ルートレベルでcrsをチェック
  if (isWGS84(geojson)) {
    return true;
  }

  return false;
}

export const GeoJson2Data = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  layer: LayerType,
  type: GeoJsonFeatureType,
  userId: string | undefined,
  displayName: string | null
) => {
  try {
    let importedData: RecordType[] = [];

    const isValidGeojson = checkGeoJSONCRS(geojson);
    if (!isValidGeojson) {
      return undefined;
    }
    switch (type) {
      case 'POINT':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<Point> => feature.geometry === null || feature.geometry.type === 'Point'
          )
          .map((feature) => {
            return {
              ...createBase(userId, displayName),
              coords: feature.geometry === null ? undefined : latlonToLatLonObject(feature.geometry.coordinates),
              field: createFields(layer.field, feature),
            };
          });
        break;
      case 'MULTIPOINT':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<MultiPoint> =>
              feature.geometry === null || feature.geometry.type === 'MultiPoint'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(userId, displayName),
                coords: undefined,
                field: createFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(userId, displayName),
                coords: feature.geometry === null ? undefined : latlonToLatLonObject(partCoords),
                field: createFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;
      case 'LINE':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<LineString> =>
              feature.geometry === null || feature.geometry.type === 'LineString'
          )
          .map((feature) => ({
            ...createBase(userId, displayName),
            ...createGeometryFromLineStringGeoJson(feature.geometry.coordinates),
            field: createFields(layer.field, feature),
          }));
        break;
      case 'MULTILINE':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<MultiLineString> =>
              feature.geometry === null || feature.geometry.type === 'MultiLineString'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(userId, displayName),
                coords: undefined,
                field: createFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(userId, displayName),
                ...createGeometryFromLineStringGeoJson(partCoords),
                field: createFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;

      case 'POLYGON':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<Polygon> => feature.geometry === null || feature.geometry.type === 'Polygon'
          )
          .map((feature) => ({
            ...createBase(userId, displayName),
            ...createGeometryFromPolygonGeoJson(feature.geometry.coordinates),
            field: createFields(layer.field, feature),
          }));
        break;
      case 'MULTIPOLYGON':
        importedData = geojson.features
          .filter(
            (feature): feature is Feature<MultiPolygon> =>
              feature.geometry === null || feature.geometry.type === 'MultiPolygon'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(userId, displayName),
                coords: undefined,
                field: createFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(userId, displayName),
                ...createGeometryFromPolygonGeoJson(partCoords),
                field: createFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;
    }
    return importedData;
  } catch (e) {
    //console.log(e);
    return undefined;
  }
};

export const generateCSV = (
  dataSet: RecordType[],
  field: LayerType['field'],
  type: FeatureType,
  isMapMemoLayer: boolean
) => {
  const mapMemoHeader = ['_group', '_strokeWidth', '_strokeColor', '_strokeStyle', '_stamp', '_zoom', '_visible'];
  let header = field.map((f) => f.name).join(',');
  if (isMapMemoLayer) {
    header = header + ',' + '_id' + ',' + mapMemoHeader.join(',') + ',' + '_qgisColor';
  }
  header = header + ',' + 'geometry';

  const properties = dataSet.map((record) => {
    let fieldCSV = field
      .map(({ name }) => {
        const fieldValue = record.field[name];
        if (isPhotoField(fieldValue)) {
          return `"${fieldValue.map((p) => p.name).join(',')}"`;
        } else {
          return `"${fieldValue}"`;
        }
      })
      .join(',');

    if (isMapMemoLayer) {
      const mapMemoProperties = mapMemoHeader.map((name) => record.field[name] ?? '').join(',');
      const id = record.id;
      const qgisColor = record.field._strokeColor ? rgbaString2qgis(record.field._strokeColor as string) : '';
      fieldCSV = fieldCSV + ',' + id + ',' + mapMemoProperties + ',' + qgisColor;
    }
    return fieldCSV;
  });

  let geometries: string[];
  switch (type) {
    case 'NONE':
      geometries = dataSet.map(() => '');
      break;
    case 'POINT':
      geometries = dataSet.map(({ coords }) => {
        if (isLocationType(coords)) {
          return `"POINT(${coords.longitude} ${coords.latitude})"`;
        } else {
          return '';
        }
      });
      break;
    case 'LINE':
      geometries = dataSet.map(({ coords }) => {
        if (isLocationTypeArray(coords)) {
          if (coords.length === 1) {
            //MapMemoのSTAMPの場合
            return `"POINT(${coords[0].longitude} ${coords[0].latitude})"`;
          }
          const linestring = coords.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
          return `"LINESTRING(${linestring})"`;
        } else {
          return '';
        }
      });
      break;
    case 'POLYGON':
      geometries = dataSet.map(({ coords, holes }) => {
        if (isLocationTypeArray(coords)) {
          const polygonstring = coords.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
          const holestring = (holes !== undefined ? (Object.values(holes) as LocationType[][]) : [])
            .map((hole) => {
              const hole_one = hole.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
              return `(${hole_one})`;
            })
            .join(',');
          return `"POLYGON((${polygonstring}),${holestring})"`;
        } else {
          return '';
        }
      });
      break;
  }
  const csv =
    '\ufeff' +
    header +
    String.fromCharCode(10) +
    properties.map((property, i) => property + ',' + geometries[i]).join(String.fromCharCode(10));
  return csv;
};

const generateDescription = (record: RecordType, field: FieldType[]) => {
  return field
    .map(({ name }) => {
      const fieldValue = record.field[name];
      if (isPhotoField(fieldValue)) {
        return `${name}: ${fieldValue.map((p) => p.name).join(',')}`;
      } else {
        return `${name}: ${fieldValue}`;
      }
    })
    .join('\n');
};

const rgbaToKmlColor = (rgba: string, transparency: boolean): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
  if (!match) return transparency ? '00ffffff' : 'ffffffff';

  const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
  const a = transparency
    ? '00'
    : match[4]
    ? Math.round(parseFloat(match[4]) * 255)
        .toString(16)
        .padStart(2, '0')
    : 'ff';

  return `${a}${b}${g}${r}`;
};

const getLineWidth = (layer: LayerType, feature: RecordType): number => {
  if (layer.colorStyle.colorType === 'INDIVIDUAL' && feature.field._strokeWidth !== undefined) {
    return feature.field._strokeWidth as number;
  } else if (layer.colorStyle.lineWidth !== undefined) {
    return layer.colorStyle.lineWidth;
  } else {
    return 1.5; // デフォルト値
  }
};

export const generateKML = (data: RecordType[], layer: LayerType) => {
  const kml = xmlBuilder
    .create('kml', {
      encoding: 'UTF-8',
    })
    .att('xmlns', 'http://www.opengis.net/kml/2.2');

  const document = kml.ele('Document');

  const addStyleToPlacemark = (placemark: any, feature: RecordType) => {
    const rgbaColor = getColor(layer, feature);
    const transparency = Boolean(layer.colorStyle.transparency);
    const kmlColor = rgbaToKmlColor(rgbaColor, transparency);
    const lineWidth = getLineWidth(layer, feature);
    const style = placemark.ele('Style');

    switch (layer.type) {
      case 'POINT':
        const iconStyle = style.ele('IconStyle');
        iconStyle.ele('color', kmlColor);
        const icon = iconStyle.ele('Icon');
        icon.ele('href', 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png');
        break;
      case 'LINE':
        const lineStyle = style.ele('LineStyle');
        lineStyle.ele('color', kmlColor);
        lineStyle.ele('width', lineWidth);
        break;
      case 'POLYGON':
        const polyStyle = style.ele('PolyStyle');
        polyStyle.ele('color', kmlColor);
        polyStyle.ele('fill', '1');
        polyStyle.ele('outline', '1');
        // Add LineStyle for polygon outline
        const polygonLineStyle = style.ele('LineStyle');
        polygonLineStyle.ele('color', rgbaToKmlColor(rgbaColor, false)); // Outline is always visible
        polygonLineStyle.ele('width', lineWidth);
        break;
    }
  };

  switch (layer.type) {
    case 'POINT':
      data.forEach((point) => {
        if (isLocationType(point.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, point);
          const pointElement = placemark.ele('Point');
          pointElement.ele('coordinates', `${point.coords.longitude},${point.coords.latitude}`);
          placemark.ele('name', generateLabel(layer, point));
          placemark.ele('description', generateDescription(point, layer.field));
        }
      });
      break;
    case 'LINE':
      data.forEach((line) => {
        if (isLocationTypeArray(line.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, line);
          const lineString = placemark.ele('LineString');
          const coordinates = line.coords.map((coord) => `${coord.longitude},${coord.latitude}`).join(' ');
          lineString.ele('coordinates', coordinates);
          placemark.ele('name', generateLabel(layer, line));
          placemark.ele('description', generateDescription(line, layer.field));
        }
      });
      break;
    case 'POLYGON':
      data.forEach((polygon) => {
        if (isLocationTypeArray(polygon.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, polygon);
          const polygonElement = placemark.ele('Polygon');
          const outerBoundary = polygonElement.ele('outerBoundaryIs');
          const linearRing = outerBoundary.ele('LinearRing');
          const coordinates = polygon.coords.map((coord) => `${coord.longitude},${coord.latitude}`).join(' ');
          linearRing.ele('coordinates', coordinates);
          placemark.ele('name', generateLabel(layer, polygon));
          placemark.ele('description', generateDescription(polygon, layer.field));
        }
      });
      break;
  }

  return kml.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};
export const generateGPX = (data: RecordType[], type: FeatureType) => {
  const gpx = xmlBuilder
    .create('gpx', {
      encoding: 'UTF-8',
    })
    .att('creator', 'ecoris')
    .att('version', '1.1');

  switch (type) {
    case 'POINT':
      data.forEach((point) => {
        if (isLocationType(point.coords)) {
          const time =
            point.field.time === undefined || point.field.time === '' ? undefined : dayjs(point.field.time as string);
          const wpt = gpx.ele('wpt').att('lat', point.coords.latitude).att('lon', point.coords.longitude);

          wpt.ele('name', point.field.name);
          wpt.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
          if (point.coords.ele) wpt.ele('ele', point.coords.ele);
          wpt.ele('cmt', point.field.cmt);
        }
      });
      break;
    case 'LINE':
      data.forEach((line, id) => {
        if (isLocationTypeArray(line.coords)) {
          const time =
            line.field.time === undefined || line.field.time === '' ? undefined : dayjs(line.field.time as string);
          const trk = gpx.ele('trk');
          trk.ele('name', line.field.name ?? id.toString());
          //console.log(dayjs(line.field.time ? (line.field.time as string) : 0));
          trk.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
          trk.ele('cmt', line.field.cmt ?? '');
          const trkseg = trk.ele('trkseg');
          line.coords.forEach((coord) => {
            //console.log(dayjs.unix(coord.timestamp!).toISOString());
            const trkpt = trkseg.ele('trkpt').att('lat', coord.latitude).att('lon', coord.longitude);
            coord.timestamp && trkpt.ele('time', dayjs(coord.timestamp).toISOString());
            coord.ele && trkpt.ele('ele', coord.ele);
          });
        }
      });
      break;
  }

  // Close the `<gpx>` element and pretty format it
  return gpx.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};

export const isPhotoField = (value: any): value is PhotoType[] => {
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (value[0].thumbnail !== undefined) return true;
  }
  return false;
};

const generateProperties = (record: RecordType, field: LayerType['field']) => {
  const properties = field
    .map(({ name }) => {
      const fieldValue = record.field[name];
      if (isPhotoField(fieldValue)) {
        const photoIds = fieldValue.map((p) => p.name).join(',');
        return { [name]: photoIds };
      } else {
        return { [name]: fieldValue };
      }
    })
    .reduce((obj, userObj) => Object.assign(obj, userObj), {});

  return properties;
};

export const generateGeoJson = (
  data: RecordType[] | RecordType[],
  field: LayerType['field'],
  type: GeoJsonFeatureType,
  layerName: string,
  isMapMemoLayer: boolean
) => {
  const geojson = {
    type: 'FeatureCollection',
    name: layerName,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
  };
  let features;
  switch (type) {
    case 'POINT':
      features = data.map((record) => {
        const properties = generateProperties(record, field);

        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
          geometry: isLocationType(record.coords)
            ? {
                type: 'Point',
                coordinates: [record.coords.longitude, record.coords.latitude],
              }
            : null,
        };
        return feature;
      });
      break;
    case 'LINE':
      features = data.map((record) => {
        const properties = generateProperties(record, field);
        const mapMemoProperties = isMapMemoLayer
          ? {
              _visible: record.visible,
              _id: record.id,
              _group: record.field._group ?? '',
              _strokeWidth: record.field._strokeWidth ?? '',
              _strokeColor: record.field._strokeColor ?? '',
              _strokeStyle: record.field._strokeStyle ?? '',
              _stamp: record.field._stamp ?? '',
              _zoom: record.field._zoom ?? '',
              _qgisColor: record.field._strokeColor ? rgbaString2qgis(record.field._strokeColor as string) : '',
            }
          : { _visible: record.visible, _id: record.id };
        let geometry;
        if (isLocationTypeArray(record.coords)) {
          if (record.coords.length === 1) {
            //MapMemoのSTAMPの場合

            geometry = {
              type: 'Point',
              coordinates: [record.coords[0].longitude, record.coords[0].latitude],
            };
          } else {
            geometry = {
              type: 'LineString',
              coordinates: record.coords.map((coords) => [coords.longitude, coords.latitude]),
            };
          }
        } else {
          geometry = null;
        }
        const feature = {
          type: 'Feature',
          properties: {
            ...properties,
            ...mapMemoProperties,
          },
          geometry: geometry,
        };
        return feature;
      });
      break;

    case 'POLYGON':
      features = data.map((record) => {
        const properties = generateProperties(record, field);
        let geometry;
        if (isLocationTypeArray(record.coords)) {
          const coordinates = record.coords.map((coords) => [coords.longitude, coords.latitude]);
          const holes = (record.holes !== undefined ? (Object.values(record.holes) as LocationType[][]) : []).map(
            (hole) => hole.map((coords) => [coords.longitude, coords.latitude])
          );
          geometry = {
            type: 'Polygon',
            coordinates: [coordinates, ...holes],
          };
        } else {
          geometry = null;
        }

        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
          geometry: geometry,
        };
        return feature;
      });
      break;
    case 'CENTROID':
      features = data.map((d) => {
        const properties = field
          .map(({ name }) => ({ [name]: d.field[name] }))
          .reduce((obj, userObj) => Object.assign(obj, userObj), {});
        const coordinates = d.centroid ? [d.centroid!.longitude, d.centroid!.latitude] : [];
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: d.visible, _id: d.id },
          geometry: {
            type: 'Point',
            coordinates: coordinates,
          },
        };
        return feature;
      });
      break;
    case 'LINEEND':
      features = data.map((d) => {
        const properties = field
          .map(({ name }) => ({ [name]: d.field[name] }))
          .reduce((obj, userObj) => Object.assign(obj, userObj), {});
        let geometry;
        if (isLocationTypeArray(d.coords)) {
          const coords = d.coords;
          const coordinates = coords[coords.length - 1];
          geometry = {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude],
          };
        } else {
          geometry = null;
        }
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: d.visible, _id: d.id },
          geometry: geometry,
        };
        return feature;
      });
      break;
  }
  return { ...geojson, features: features };
};

function createGeometryFromLineStringGeoJson(coordinates: Position[] | undefined) {
  if (coordinates === undefined) return { coords: undefined, centroid: undefined };
  const coords = coordinates.map((xy) => latlonToLatLonObject(xy));
  const centroid = calcLineMidPoint(coords);
  return { coords, centroid };
}

function createGeometryFromPolygonGeoJson(coordinates: Position[][]) {
  if (coordinates === undefined) return { coords: undefined, holes: undefined, centroid: undefined };
  const polygon = turf.polygon(coordinates);
  const simplified = simplify(polygon, {
    tolerance: 0.00001,
    highQuality: true,
  });
  //console.log(simplified);
  const coords = simplified.geometry.coordinates[0].map((xy) => latlonToLatLonObject(xy));
  const holes = simplified.geometry.coordinates
    .slice(1)
    .reduce((result, hole, index) => ({ ...result, [`hole${index}`]: hole.map((xy) => latlonToLatLonObject(xy)) }), {});
  const centroid = calcCentroid(coords);
  return { coords, holes, centroid };
}

function createBase(userId: string | undefined, displayName: string | null) {
  return {
    id: ulid(),
    userId: userId,
    displayName: displayName,
    redraw: false,
    visible: true,
  };
}

function createFields(fields: FieldType[], feature: Feature) {
  const properties = feature.properties;
  if (properties === null) return {};
  return fields
    .map((field) =>
      field.format === 'PHOTO'
        ? {
            [field.name]: [],
          }
        : {
            [field.name]: properties[field.name] || '',
          }
    )
    .reduce((obj, userObj) => Object.assign(obj, userObj), {});
}

export function createLayerFromGeoJson(
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  fileName: string,
  geoJsonFeatureType: GeoJsonFeatureType
): LayerType {
  let featureType: FeatureType;
  if (geoJsonFeatureType === 'POINT') {
    featureType = 'POINT';
  } else if (geoJsonFeatureType === 'MULTIPOINT') {
    featureType = 'POINT';
  } else if (geoJsonFeatureType === 'LINE') {
    featureType = 'LINE';
  } else if (geoJsonFeatureType === 'MULTILINE') {
    featureType = 'LINE';
  } else if (geoJsonFeatureType === 'POLYGON') {
    featureType = 'POLYGON';
  } else if (geoJsonFeatureType === 'MULTIPOLYGON') {
    featureType = 'POLYGON';
  } else {
    featureType = 'NONE';
  }
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: '',
    visible: true,
    active: false,
    field: createAllStringFieldsFromGeoJson(geojson),
  };
}

function createGpxLayer(fileName: string, featureType: FeatureType): LayerType {
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: 'name',
    visible: true,
    active: false,
    field: [
      { id: ulid(), name: 'name', format: 'STRING' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
    ],
  };
}

function createAllStringFieldsFromGeoJson(geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) {
  if (geojson.features === undefined) return [];
  if (geojson.features.length === 0) return [];
  const properties = geojson.features[0].properties;
  if (properties === null) return [];
  const fields = Object.keys(properties).map((fieldName) => ({
    id: ulid(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));
  return fields;
}

export function createLayerFromCsv(csv: string, fileName: string, featureType: FeatureType): LayerType {
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: '',
    visible: true,
    active: false,
    field: createAllStringFieldsFromCsv(csv),
  };
}

function createAllStringFieldsFromCsv(csv: string) {
  const csvFields = csv.split('\n')[0].split(',');
  const fields = csvFields.map((fieldName) => ({
    id: ulid(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));
  return fields;
}

export function detectGeoJsonType(geojson: FeatureCollection<Geometry | null, GeoJsonProperties>): GeoJsonFeatureType {
  const geometry = geojson.features[0].geometry;
  if (geometry === null) return 'NONE';
  switch (geometry.type) {
    case 'Point':
      return 'POINT';
    case 'MultiPoint':
      return 'MULTIPOINT';
    case 'LineString':
      return 'LINE';
    case 'MultiLineString':
      return 'MULTILINE';
    case 'Polygon':
      return 'POLYGON';
    case 'MultiPolygon':
      return 'MULTIPOLYGON';
    default:
      return 'NONE';
  }
}
