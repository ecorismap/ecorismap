import React from 'react';
import MapView, { Region } from 'react-native-maps';
import { MapRef, ViewState } from 'react-map-gl/maplibre';
import { LocationStateType } from '../types';

export interface MapViewContextType {
  mapViewRef: React.RefObject<MapView | MapRef | null>;
  mapType: string;
  zoom: number;
  zoomDecimal: number;
  onRegionChangeMapView: (region: Region | ViewState, isGestureMove?: boolean) => void;
  onPressMapView: (e: any) => void;
  onDragMapView: () => void;
  onDrop: (newPoint: any) => void;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  headingUp: boolean;
  azimuth: number;
  currentLocation: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
  } | null;
  gpsState: LocationStateType;
  pressGPS: () => void;
  isPinch: boolean;
  panResponder: any;
  isDrawLineVisible: boolean;
  isTerrainActive?: boolean;
  toggleTerrain?: () => void;
}

export const MapViewContext = React.createContext<MapViewContextType>({} as MapViewContextType);
