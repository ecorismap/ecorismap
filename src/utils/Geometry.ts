import { parse } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
import xmlBuilder from 'xmlbuilder';
import { RecordType, FeatureType, LayerType, LocationType, GeoJsonFeatureType, PhotoType, FormatType } from '../types';
import { LatLng } from 'react-native-maps';
import * as turf from '@turf/helpers';
import simplify from '@turf/simplify';
import { COLOR, FUNC_LOGIN } from '../constants/AppConstants';
import dayjs from '../i18n/dayjs';
import sanitize from 'sanitize-filename';

export const Gpx2Data = (
  gpx: string,
  type: FeatureType,
  fileName: string,
  userId: string | undefined,
  displayName: string | null
) => {
  //console.log(type);
  const newLayer: LayerType = {
    id: uuidv4(),
    name: sanitize(fileName),
    type: type,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      colorRamp: 'RANDOM',
      colorList: [],
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
        const record: RecordType = {
          id: uuidv4(),
          userId: userId,
          displayName: displayName,
          redraw: false,
          visible: true,
          coords: {
            latitude: parseFloat(d.lat),
            longitude: parseFloat(d.lon),
          },
          field: {
            name: d.name ? d.name : '',
            time: d.time ? dayjs(d.time).format() : dayjs().format(),
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

        const coords = trksegs
          .map((trackseg: any) =>
            trackseg.trkpt.map((trkpt: { lat: string; lon: string }) => ({
              latitude: parseFloat(trkpt.lat),
              longitude: parseFloat(trkpt.lon),
            }))
          )
          .flat();

        const record: RecordType = {
          id: uuidv4(),
          userId: userId,
          displayName: displayName,
          redraw: false,
          visible: true,
          coords: coords,
          centroid: coords[coords.length - 1],
          field: {
            name: trk.name,
            time: trk.time ? dayjs(trk.time).format() : dayjs().format(),
            cmt: trk.cmt ? trk.cmt : '',
          },
        };

        return record;
      });
      break;
    }
    case 'POLYGON':
      break;
  }
  //console.log(importedData.map((n) => n.name));
  return { layer: newLayer, recordSet: importedData };
};

export const GeoJson2Data = (
  geojson: string,
  type: GeoJsonFeatureType,
  fileName: string,
  userId: string | undefined,
  displayName: string | null
) => {
  const json = JSON.parse(geojson);
  const fields = Object.keys(json.features[0].properties).map((fieldName) => ({
    id: uuidv4(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));

  let featureType: FeatureType = 'NONE';
  let importedData: RecordType[] = [];
  switch (type) {
    case 'POINT':
      featureType = 'POINT';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'Point')
        .map((feature: any) => {
          const baseData = {
            id: uuidv4(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
          };
          const coordsData = {
            coords: {
              longitude: feature.geometry.coordinates[0],
              latitude: feature.geometry.coordinates[1],
            },
          };
          const fieldsData = fields
            .map((field) => ({
              [field.name]: feature.properties[field.name] || '',
            }))
            .reduce((obj, userObj) => Object.assign(obj, userObj), {});
          const record = { ...baseData, ...coordsData, field: fieldsData };
          return record;
        });
      break;
    case 'MULTIPOINT':
      featureType = 'POINT';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'MultiPoint')
        .map((feature: any) => {
          return feature.geometry.coordinates.map((partCoords: any) => {
            const baseData = {
              id: uuidv4(),
              userId: userId,
              displayName: displayName,
              redraw: false,
              visible: true,
            };
            const coordsData = {
              coords: {
                longitude: partCoords[0],
                latitude: partCoords[1],
              },
            };

            const fieldsData = fields
              .map((field) => ({
                [field.name]: feature.properties[field.name] || '',
              }))
              .reduce((obj, userObj) => Object.assign(obj, userObj), {});
            const record: RecordType = { ...baseData, ...coordsData, field: fieldsData };
            return record;
          });
        })
        .flat();

      break;
    case 'LINE':
      featureType = 'LINE';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'LineString')
        .map((feature: any) => {
          const baseData = {
            id: uuidv4(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
          };
          const coordsData = {
            coords: feature.geometry.coordinates.map((coords: any) => ({
              longitude: coords[0],
              latitude: coords[1],
            })),
            centroid: {
              longitude: feature.geometry.coordinates[feature.geometry.coordinates.length - 1][0],
              latitude: feature.geometry.coordinates[feature.geometry.coordinates.length - 1][1],
            },
          };
          const fieldsData = fields
            .map((field) => ({
              [field.name]: feature.properties[field.name] || '',
            }))
            .reduce((obj, userObj) => Object.assign(obj, userObj), {});
          const record: RecordType = { ...baseData, ...coordsData, field: fieldsData };
          return record;
        });
      break;
    case 'MULTILINE':
      featureType = 'LINE';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'MultiLineString')
        .map((feature: any) => {
          return feature.geometry.coordinates.map((partCoords: any) => {
            const baseData = {
              id: uuidv4(),
              userId: userId,
              displayName: displayName,
              redraw: false,
              visible: true,
            };
            const coordsData = {
              coords: partCoords.map((coords: any) => ({
                longitude: coords[0],
                latitude: coords[1],
              })),
              centroid: {
                longitude: partCoords[partCoords.length - 1][0],
                latitude: partCoords[partCoords.length - 1][1],
              },
            };

            const fieldsData = fields
              .map((field) => ({
                [field.name]: feature.properties[field.name] || '',
              }))
              .reduce((obj, userObj) => Object.assign(obj, userObj), {});
            const record: RecordType = { ...baseData, ...coordsData, field: fieldsData };
            return record;
          });
        })
        .flat();

      break;

    case 'POLYGON':
      featureType = 'POLYGON';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'Polygon')
        .map((feature: any) => {
          const baseData = {
            id: uuidv4(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
          };
          const polygon = turf.polygon(feature.geometry.coordinates);
          const simplified = simplify(polygon, {
            tolerance: 0.00001,
            highQuality: true,
          });
          //console.log(simplified);
          const coordsData = {
            coords: simplified.geometry.coordinates[0].map((coords: any) => ({
              longitude: coords[0],
              latitude: coords[1],
            })),
            holes: simplified.geometry.coordinates.slice(1).reduce((result, hole: any, index) => {
              const holeArray = hole.map((coords: any) => ({
                longitude: coords[0],
                latitude: coords[1],
              }));
              return { ...result, [`hole${index}`]: holeArray };
            }, {}),
            centroid: {
              longitude:
                feature.geometry.coordinates[0].reduce((p: any, c: any) => p + c[0], 0) /
                feature.geometry.coordinates[0].length,
              latitude:
                feature.geometry.coordinates[0].reduce((p: any, c: any) => p + c[1], 0) /
                feature.geometry.coordinates[0].length,
            },
          };

          const fieldsData = fields
            .map((field) => ({
              [field.name]: feature.properties[field.name] || '',
            }))
            .reduce((obj, userObj) => Object.assign(obj, userObj), {});
          //console.log({ ...baseData, ...fieldsData });
          const record: RecordType = { ...baseData, ...coordsData, field: fieldsData };
          return record;
        });
      break;
    case 'MULTIPOLYGON':
      featureType = 'POLYGON';
      importedData = json.features
        .filter((feature: any) => feature.geometry.type === 'MultiPolygon')
        .map((feature: any) => {
          return feature.geometry.coordinates.map((partCoords: any) => {
            const baseData = {
              id: uuidv4(),
              userId: userId,
              displayName: displayName,
              redraw: false,
              visible: true,
            };

            const polygon = turf.polygon(partCoords);
            const simplified = simplify(polygon, {
              tolerance: 0.00001,
              highQuality: true,
            });
            const coordsData = {
              //MultiPolygon
              coords: simplified.geometry.coordinates[0].map((coords: any) => ({
                longitude: coords[0],
                latitude: coords[1],
              })),
              holes: simplified.geometry.coordinates.slice(1).reduce((result, hole: any, index) => {
                const holeArray = hole.map((coords: any) => ({
                  longitude: coords[0],
                  latitude: coords[1],
                }));
                return { ...result, [`hole${index}`]: holeArray };
              }, {}),

              centroid: {
                longitude: partCoords[0].reduce((p: any, c: any) => p + c[0], 0) / partCoords[0].length,
                latitude: partCoords[0].reduce((p: any, c: any) => p + c[1], 0) / partCoords[0].length,
              },
            };
            const fieldsData = fields
              .map((field) => ({
                [field.name]: feature.properties[field.name] || '',
              }))
              .reduce((obj, userObj) => Object.assign(obj, userObj), {});
            //console.log(feature.properties.name);
            const record: RecordType = { ...baseData, ...coordsData, field: fieldsData };
            return record;
          });
        })
        .flat();
      break;
  }

  const newLayer: LayerType = {
    id: uuidv4(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      colorRamp: 'RANDOM',
      colorList: [],
    },
    label: '',
    visible: true,
    active: false,
    field: fields,
  };

  return { layer: newLayer, recordSet: importedData };
};

export const generateCSV = (dataSet: RecordType[], field: LayerType['field'], type: FeatureType) => {
  const header = FUNC_LOGIN
    ? 'displayName' + ',' + field.map((f) => f.name).join(',') + ',' + 'geometry'
    : field.map((f) => f.name).join(',') + ',' + 'geometry';
  //console.log(header);
  const properties = dataSet.map((record) => {
    const fieldCSV = field
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
    return FUNC_LOGIN ? record.displayName ?? '' + ',' + fieldCSV : fieldCSV;
  });

  let geometries: string[];
  switch (type) {
    case 'NONE':
      geometries = dataSet.map(() => '');
      break;
    case 'POINT':
      geometries = dataSet.map(
        ({ coords }) => `POINT(${(coords as LocationType).longitude} ${(coords as LocationType).latitude})`
      );
      break;
    case 'LINE':
      geometries = dataSet.map(({ coords }) => {
        const linestring = (coords as LocationType[]).map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
        return `LINESTRING(${linestring})`;
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
        return `POLYGON((${polygonstring}),${holestring})`;
      });
      break;
  }
  const csv =
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
        const wpt = gpx
          .ele('wpt')
          .att('lat', (point.coords as LocationType).latitude)
          .att('lon', (point.coords as LocationType).longitude);

        wpt.ele('name', point.field.name);
        wpt.ele('time', dayjs(point.field.time ? (point.field.time as string) : 0).toISOString());
        wpt.ele('cmt', point.field.cmt);
      });
      break;
    case 'LINE':
      data.forEach((line) => {
        const trk = gpx.ele('trk');
        trk.ele('name', line.field.name);
        //console.log(dayjs(line.field.time ? (line.field.time as string) : 0));
        trk.ele('time', dayjs(line.field.time ? (line.field.time as string) : 0).toISOString());
        trk.ele('cmt', line.field.cmt);
        const trkseg = trk.ele('trkseg');
        (line.coords as LocationType[]).forEach((coord) => {
          const trkpt = trkseg.ele('trkpt').att('lat', coord.latitude).att('lon', coord.longitude);
          //# Todo proj4js convert
          //trkpt.ele("ele", coord.altitude);
          trkpt.ele('time', dayjs(coord.timestamp).toISOString());
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

const isPhotoField = (value: any): value is PhotoType[] => {
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
  if (FUNC_LOGIN) {
    if ('displayName' in record) {
      properties.displayName === undefined
        ? (properties.displayName = record.displayName as string)
        : (properties.displayName_ = record.displayName as string);
    }
  }
  return properties;
};

export const generateGeoJson = (
  data: RecordType[] | RecordType[],
  field: LayerType['field'],
  type: GeoJsonFeatureType,
  layerName: string
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
    case 'NONE':
      features = data.map((record) => {
        const properties = generateProperties(record, field);
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
          geometry: null,
        };
        return feature;
      });
      break;
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
        const coordinates = (record.coords as LocationType[]).map((coords) => [coords.longitude, coords.latitude]);
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: record.visible, _id: record.id },
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
  }
  return { ...geojson, features: features };
};

export const getArrowDeg = (feature: RecordType) => {
  let arrowDeg = 0;
  const coords = feature.coords as LatLng[];
  if (coords.length > 2) {
    const v2 = coords[coords.length - 1];
    const v1 = coords[coords.length - 3];
    const v = [v2.longitude - v1.longitude, v2.latitude - v1.latitude];
    arrowDeg = 90 - Math.atan2(v[1], v[0]) * (180 / Math.PI);
    //console.log("####", arrowDeg);
  }
  return arrowDeg;
};
