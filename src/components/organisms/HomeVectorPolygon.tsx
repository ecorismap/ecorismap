import React, { useEffect, useState } from 'react';

import { Geojson } from 'react-native-maps';
import RNFetchBlob from 'rn-fetch-blob';
import Pbf from 'pbf';
import { Buffer } from 'buffer';
import VectorTile from '@mapbox/vector-tile';
import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import * as turf from '@turf/turf';
import { latToTileY, lonToTileX } from '../../utils/Tile';
import { useWindow } from '../../hooks/useWindow';
import * as FileSystem from 'expo-file-system';
import { exportFile } from '../../utils/File';
import { PMTiles } from './pmtiles';

interface Props {
  url: string;
  zoom: number;
}

export const VectorTiles = (prop: Props) => {
  const { url, zoom } = prop;
  const { mapRegion } = useWindow();

  const getTiles = () => {
    const minLon = mapRegion.longitude - mapRegion.longitudeDelta / 2;
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2;
    const maxLon = mapRegion.longitude + mapRegion.longitudeDelta / 2;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2;
    //console.log(minLon, minLat, maxLon, maxLat);
    const minTileX = lonToTileX(minLon, zoom);
    const maxTileX = lonToTileX(maxLon, zoom);
    const minTileY = latToTileY(maxLat, zoom);
    const maxTileY = latToTileY(minLat, zoom);
    //console.log(minTileX, maxTileX, minTileY, maxTileY);
    const tiles: { x: number; y: number; z: number }[] = [];

    for (let x = minTileX; x <= maxTileX + 1; x++) {
      for (let y = minTileY; y <= maxTileY + 1; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }
    //console.log(tiles);
    return tiles;
  };
  const tiles = getTiles();
  return (
    <>
      {tiles.map((d, index) => (
        <VectorPolygon key={index} url={url} z={d.z} x={d.x} y={d.y} />
      ))}
    </>
  );
};

interface VectorPolygonProps {
  url: string;
  z: number;
  x: number;
  y: number;
}

const VectorPolygon = React.memo((prop: VectorPolygonProps) => {
  const { url, z, x, y } = prop;
  const [features, setFeatures] = useState<{
    type: 'FeatureCollection';
    features: Feature<Geometry, GeoJsonProperties>[];
  }>();
  const LAYER_NAME = '北上川H30';
  //const LAYER_NAME = 'AdmArea';

  const basePath = `${FileSystem.documentDirectory}${z}/${x}`;
  const filePath = `${basePath}/${y}.geojson`;

  useEffect(() => {
    const fetchAndSave = async () => {
      const dirInfo = await FileSystem.getInfoAsync(basePath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(basePath, { intermediates: true });
      }

      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        const fileContent = await FileSystem.readAsStringAsync(filePath);
        // if (x === 14 && y == 6) await exportFile(fileContent, `${z}_${x}_${y}.geojson`);
        setFeatures(JSON.parse(fileContent));
        console.log(`hit ${z}/${x}/${y}.geojson`);
      } else {
        const p = new PMTiles('https://www.ecoris.co.jp/map/kitakami_h30.pmtiles');
        //const meta = await p.getMetadata();
        //console.log(meta.tilestats.layers);

        const a = await p.getZxy(z, x, y);
        if (a === undefined) return;
        const pbf = new Pbf(a.data);
        const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];
        console.log(layer.feature(0));
        const features_ = layer
          ? Array.from({ length: layer.length }, (_, i) => layer.feature(i).toGeoJSON(x, y, z))
          : [];

        const geojson = {
          type: 'FeatureCollection' as const,
          features: features_,
        };
        setFeatures(geojson);
        FileSystem.writeAsStringAsync(filePath, JSON.stringify(geojson))
          .then(() => {
            console.log(`Saved to ${filePath}`);
          })
          .catch((error) => {
            //console.error(error);
          });
        //console.log(layer);
        // RNFetchBlob.fetch('GET', `${url}/${z}/${x}/${y}.pbf`)
        //   .then((response) => {
        //     const base64Data = response.data;
        //     const binaryData = Buffer.from(base64Data, 'base64');
        //     const pbf = new Pbf(binaryData);
        //     const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];
        //     const features_ = layer
        //       ? Array.from({ length: layer.length }, (_, i) => layer.feature(i).toGeoJSON(x, y, z))
        //       : [];

        //     const geojson = {
        //       type: 'FeatureCollection' as const,
        //       features: features_,
        //     };
        //     setFeatures(geojson);
        //     FileSystem.writeAsStringAsync(filePath, JSON.stringify(geojson))
        //       .then(() => {
        //         console.log(`Saved to ${filePath}`);
        //       })
        //       .catch((error) => {
        //         //console.error(error);
        //       });
        //   })
        //   .catch((error) => {
        //     //console.error(error);
        //   });
      }
    };

    fetchAndSave();
  }, [basePath, filePath, url, x, y, z]);

  if (!features) return null;
  return <Geojson geojson={features} zIndex={100} strokeColor="red" fillColor="#00ff0010" strokeWidth={2} />;
});
