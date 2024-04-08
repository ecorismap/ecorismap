import { parse } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
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
} from 'geojson';
import { Position } from '@turf/turf';
import { rgbaString2qgis } from './Color';
import { cloneDeep } from 'lodash';

export const Csv2Data = (
  csv: string,
  type: FeatureType,
  fileName: string,
  userId: string | undefined,
  displayName: string | null,
  importedLayer?: LayerType
) => {
  try {
    //console.log(type);
    const layer = importedLayer === undefined ? createLayerFromCsv(csv, fileName, type) : cloneDeep(importedLayer);

    const body = csv.split('\n').slice(1);

    const importedData: RecordType[] = body.map((line) => {
      const data = line.split(',');
      //layer.fieldとdataの配列からfieldを作成
      const fields = layer.field
        .map((field, idx) => {
          return { [field.name]: data[idx] };
        })
        .reduce((obj, userObj) => Object.assign(obj, userObj), {});

      return {
        id: uuidv4(),
        userId: userId,
        displayName: displayName,
        redraw: false,
        visible: true,
        coords: {
          latitude: 0,
          longitude: 0,
        },
        field: fields,
      };
    });

    //csvから
    return { layer: layer, recordSet: importedData };
  } catch (e) {
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

    const json = parse(gpx, {
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    const gpxkey = Object.keys(json)[0];
    //console.log(json[gpxkey]);
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
            id: uuidv4(),
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
            id: uuidv4(),
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

export const GeoJson2Data = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  layer: LayerType,
  type: GeoJsonFeatureType,
  userId: string | undefined,
  displayName: string | null
) => {
  try {
    let importedData: RecordType[] = [];

    switch (type) {
      case 'POINT':
        importedData = geojson.features
          .filter((feature): feature is Feature<Point> => feature.geometry?.type === 'Point')
          .map((feature) => {
            return {
              ...createBase(userId, displayName),
              coords: latlonToLatLonObject(feature.geometry.coordinates),
              field: createFields(layer.field, feature),
            };
          });
        break;
      case 'MULTIPOINT':
        importedData = geojson.features
          .filter((feature): feature is Feature<MultiPoint> => feature.geometry?.type === 'MultiPoint')
          .map((feature) =>
            feature.geometry.coordinates.map((partCoords) => ({
              ...createBase(userId, displayName),
              coords: latlonToLatLonObject(partCoords),
              field: createFields(layer.field, feature),
            }))
          )
          .flat();
        break;
      case 'LINE':
        importedData = geojson.features
          .filter((feature): feature is Feature<LineString> => feature.geometry?.type === 'LineString')
          .map((feature) => ({
            ...createBase(userId, displayName),
            ...createGeometryFromLineStringGeoJson(feature.geometry.coordinates),
            field: createFields(layer.field, feature),
          }));
        break;
      case 'MULTILINE':
        importedData = geojson.features
          .filter((feature): feature is Feature<MultiLineString> => feature.geometry?.type === 'MultiLineString')
          .map((feature) =>
            feature.geometry.coordinates.map((partCoords) => ({
              ...createBase(userId, displayName),
              ...createGeometryFromLineStringGeoJson(partCoords),
              field: createFields(layer.field, feature),
            }))
          )
          .flat();
        break;

      case 'POLYGON':
        importedData = geojson.features
          .filter((feature): feature is Feature<Polygon> => feature.geometry?.type === 'Polygon')
          .map((feature) => ({
            ...createBase(userId, displayName),
            ...createGeometryFromPolygonGeoJson(feature.geometry.coordinates),
            field: createFields(layer.field, feature),
          }));
        break;
      case 'MULTIPOLYGON':
        importedData = geojson.features
          .filter((feature): feature is Feature<MultiPolygon> => feature.geometry?.type === 'MultiPolygon')
          .map((feature) =>
            feature.geometry.coordinates.map((partCoords) => ({
              ...createBase(userId, displayName),
              ...createGeometryFromPolygonGeoJson(partCoords),
              field: createFields(layer.field, feature),
            }))
          )
          .flat();
        break;
    }

    return importedData;
  } catch (e) {
    console.log(e);
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
      .map(({ name, format }) => {
        const fieldValue = record.field[name];
        if (isPhotoField(fieldValue)) {
          return `"${fieldValue.map((p) => p.name).join(',')}"`;
        } else if (format === 'CHECK' || format === 'TABLE') {
          return `"${fieldValue}"`;
        } else {
          return fieldValue;
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
      geometries = dataSet.map(
        ({ coords }) => `"POINT(${(coords as LocationType).longitude} ${(coords as LocationType).latitude})"`
      );
      break;
    case 'LINE':
      geometries = dataSet.map(({ coords }) => {
        if ((coords as LocationType[]).length === 1) {
          //MapMemoのSTAMPの場合
          return `"POINT(${(coords as LocationType[])[0].longitude} ${(coords as LocationType[])[0].latitude})"`;
        }
        const linestring = (coords as LocationType[]).map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
        return `"LINESTRING(${linestring})"`;
      });
      break;
    case 'POLYGON':
      geometries = dataSet.map(({ coords, holes }) => {
        const polygonstring = (coords as LocationType[])
          .map((coord) => `${coord.longitude} ${coord.latitude}`)
          .join(',');
        const holestring = (holes !== undefined ? (Object.values(holes) as LocationType[][]) : [])
          .map((hole) => {
            const hole_one = hole.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
            return `(${hole_one})`;
          })
          .join(',');
        return `"POLYGON((${polygonstring}),${holestring})"`;
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
        const time =
          point.field.time === undefined || point.field.time === '' ? undefined : dayjs(point.field.time as string);
        const wpt = gpx
          .ele('wpt')
          .att('lat', (point.coords as LocationType).latitude)
          .att('lon', (point.coords as LocationType).longitude);

        wpt.ele('name', point.field.name);
        wpt.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
        (point.coords as LocationType).ele && wpt.ele('ele', (point.coords as LocationType).ele);
        wpt.ele('cmt', point.field.cmt);
      });
      break;
    case 'LINE':
      data.forEach((line, id) => {
        const time =
          line.field.time === undefined || line.field.time === '' ? undefined : dayjs(line.field.time as string);
        const trk = gpx.ele('trk');
        trk.ele('name', line.field.name ?? id.toString());
        //console.log(dayjs(line.field.time ? (line.field.time as string) : 0));
        trk.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
        trk.ele('cmt', line.field.cmt ?? '');
        const trkseg = trk.ele('trkseg');
        (line.coords as LocationType[]).forEach((coord) => {
          //console.log(dayjs.unix(coord.timestamp!).toISOString());
          const trkpt = trkseg.ele('trkpt').att('lat', coord.latitude).att('lon', coord.longitude);
          coord.timestamp && trkpt.ele('time', dayjs(coord.timestamp).toISOString());
          coord.ele && trkpt.ele('ele', coord.ele);
        });
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
        const coordinates = [(record.coords as LocationType).longitude, (record.coords as LocationType).latitude];
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
          geometry: {
            type: 'Point',
            coordinates: coordinates,
          },
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
          : {};

        if ((record.coords as LocationType[]).length === 1) {
          //MapMemoのSTAMPの場合
          const coordinates = [
            (record.coords as LocationType[])[0].longitude,
            (record.coords as LocationType[])[0].latitude,
          ];
          const feature = {
            type: 'Feature',
            properties: {
              ...properties,
              ...mapMemoProperties,
            },
            geometry: {
              type: 'Point',
              coordinates: coordinates,
            },
          };
          return feature;
        }
        const coordinates = (record.coords as LocationType[]).map((coords) => [coords.longitude, coords.latitude]);
        const feature = {
          type: 'Feature',
          properties: {
            ...properties,
            ...mapMemoProperties,
          },
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
        };
        return feature;
      });
      break;
    //ラインをポイントに変換してaccuracyとtimeを属性に　デバッグ用
    // case FEATURETYPE.LINE:
    //   features = data
    //     .map((line) => {
    //       const properties = field
    //         .map(({ name }) => ({ [name]: line.field[name] }))
    //         .reduce((obj, userObj) => Object.assign(obj, userObj), {});
    //       return (line.coords as LocationType[]).map((pos) => {
    //         const coordinates = [pos.longitude, pos.latitude];
    //         const feature = {
    //           type: 'Feature',
    //           properties: {
    //             ...properties,
    //             accuracy: pos.accuracy,
    //             time: dayjs(pos.timestamp).format('YYYY-MM-DD_HH_mm_ss'),
    //           },
    //           geometry: {
    //             type: 'Point',
    //             coordinates: coordinates,
    //           },
    //         };
    //         return feature;
    //       });
    //     })
    //     .flat();
    //   break;
    case 'POLYGON':
      features = data.map((record) => {
        const properties = generateProperties(record, field);
        const coordinates = (record.coords as LocationType[]).map((coords) => [coords.longitude, coords.latitude]);
        const holes = (record.holes !== undefined ? (Object.values(record.holes) as LocationType[][]) : []).map(
          (hole) => hole.map((coords) => [coords.longitude, coords.latitude])
        );
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates, ...holes],
          },
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
        const coords = d.coords as LocationType[];
        const coordinates = coords[coords.length - 1];
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: d.visible, _id: d.id },
          geometry: {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude],
          },
        };
        return feature;
      });
      break;
  }
  return { ...geojson, features: features };
};

function createGeometryFromLineStringGeoJson(coordinates: Position[]) {
  const coords = coordinates.map((xy) => latlonToLatLonObject(xy));
  const centroid = calcLineMidPoint(coords);
  return { coords, centroid };
}

function createGeometryFromPolygonGeoJson(coordinates: Position[][]) {
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
    id: uuidv4(),
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
    id: uuidv4(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'PRIVATE',
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
    id: uuidv4(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'PRIVATE',
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
      { id: uuidv4(), name: 'name', format: 'STRING' },
      { id: uuidv4(), name: 'time', format: 'DATETIME' },
      { id: uuidv4(), name: 'cmt', format: 'STRING' },
    ],
  };
}

function createAllStringFieldsFromGeoJson(geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) {
  if (geojson.features === undefined) return [];
  if (geojson.features.length === 0) return [];
  const properties = geojson.features[0].properties;
  if (properties === null) return [];
  const fields = Object.keys(properties).map((fieldName) => ({
    id: uuidv4(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));
  return fields;
}

export function createLayerFromCsv(csv: string, fileName: string, featureType: FeatureType): LayerType {
  return {
    id: uuidv4(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'PRIVATE',
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
    id: uuidv4(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));
  return fields;
}
