import { isMapView, isMapRef, isRegionType, isRegion, isViewState, csvToJsonArray, isValidMapListURL } from '../Map';

describe('Map', () => {
  describe('isMapView', () => {
    it('returns true for objects with animateCamera method', () => {
      const mapView = { animateCamera: jest.fn() };
      expect(isMapView(mapView)).toBe(true);
    });

    it('returns false for objects without animateCamera method', () => {
      const notMapView = { someOtherMethod: jest.fn() };
      expect(isMapView(notMapView)).toBe(false);
    });

    it('returns falsy value for null or undefined', () => {
      expect(isMapView(null)).toBe(null);
      expect(isMapView(undefined)).toBe(undefined);
    });
  });

  describe('isMapRef', () => {
    it('returns true for objects with getMap().getBounds method', () => {
      const mapRef = { getMap: () => ({ getBounds: jest.fn() }) };
      expect(isMapRef(mapRef)).toBe(true);
    });

    it('returns false for objects without getMap().getBounds method', () => {
      const notMapRef = { getMap: () => ({}) };
      expect(isMapRef(notMapRef)).toBe(false);
    });

    it('returns falsy value for null or undefined', () => {
      expect(isMapRef(null)).toBe(null);
      expect(isMapRef(undefined)).toBe(undefined);
    });
  });

  describe('isRegionType', () => {
    it('returns true for objects with zoom and latitudeDelta properties', () => {
      const region = { zoom: 10, latitudeDelta: 0.1, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegionType(region)).toBe(true);
    });

    it('returns false for objects without zoom property', () => {
      const notRegion = { latitudeDelta: 0.1, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegionType(notRegion)).toBe(false);
    });

    it('returns false for objects without latitudeDelta property', () => {
      const notRegion = { zoom: 10, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegionType(notRegion)).toBe(false);
    });
  });

  describe('isRegion', () => {
    it('returns true for objects with latitudeDelta property but no zoom property', () => {
      const region = { latitudeDelta: 0.1, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegion(region)).toBe(true);
    });

    it('returns false for objects with zoom property', () => {
      const notRegion = { zoom: 10, latitudeDelta: 0.1, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegion(notRegion)).toBe(false);
    });

    it('returns false for objects without latitudeDelta property', () => {
      const notRegion = { longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isRegion(notRegion)).toBe(false);
    });
  });

  describe('isViewState', () => {
    it('returns true for objects with zoom property but no latitudeDelta property', () => {
      const viewState = { zoom: 10, latitude: 35, longitude: 135 };
      expect(isViewState(viewState)).toBe(true);
    });

    it('returns false for objects with latitudeDelta property', () => {
      const notViewState = { zoom: 10, latitudeDelta: 0.1, longitudeDelta: 0.1, latitude: 35, longitude: 135 };
      expect(isViewState(notViewState)).toBe(false);
    });

    it('returns false for objects without zoom property', () => {
      const notViewState = { latitude: 35, longitude: 135 };
      expect(isViewState(notViewState)).toBe(false);
    });
  });

  describe('csvToJsonArray', () => {
    it('converts CSV string to JSON array', () => {
      const csv = 'name,age,city\nJohn,30,New York\nJane,25,San Francisco';
      const expected = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'San Francisco' },
      ];
      expect(csvToJsonArray(csv)).toEqual(expected);
    });

    it('handles empty CSV', () => {
      expect(csvToJsonArray('')).toEqual([]);
    });

    it('handles CSV with only headers', () => {
      expect(csvToJsonArray('name,age,city')).toEqual([]);
    });

    it('handles boolean values', () => {
      const csv = 'name,isActive\nJohn,true\nJane,false';
      const expected = [
        { name: 'John', isActive: true },
        { name: 'Jane', isActive: false },
      ];
      expect(csvToJsonArray(csv)).toEqual(expected);
    });

    it('handles numeric values', () => {
      const csv = 'name,age\nJohn,30\nJane,25';
      const expected = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];
      expect(csvToJsonArray(csv)).toEqual(expected);
    });

    it('handles missing values', () => {
      const csv = 'name,age,city\nJohn,30,\nJane,,San Francisco';
      const expected = [
        { name: 'John', age: 30, city: '' },
        { name: 'Jane', age: '', city: 'San Francisco' },
      ];
      expect(csvToJsonArray(csv)).toEqual(expected);
    });

    it('handles custom delimiter', () => {
      const csv = 'name;age;city\nJohn;30;New York\nJane;25;San Francisco';
      const expected = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'San Francisco' },
      ];
      expect(csvToJsonArray(csv, ';')).toEqual(expected);
    });
  });

  describe('isValidMapListURL', () => {
    it('returns true for valid Google Sheets CSV URL', () => {
      const url =
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMrdVYRXwBY48wvorb8X7mBG8lx2cdFeRVMzxLqlkGbep2GzR0D22Ti4k0XbXeE_9T8TYlidR5fRDt/pub?gid=0&single=true&output=csv';
      expect(isValidMapListURL(url)).toBe(true);
    });

    it('returns false for invalid URL', () => {
      const url = 'https://example.com/spreadsheet.csv';
      expect(isValidMapListURL(url)).toBe(false);
    });

    it('returns false for non-CSV Google Sheets URL', () => {
      const url =
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMrdVYRXwBY48wvorb8X7mBG8lx2cdFeRVMzxLqlkGbep2GzR0D22Ti4k0XbXeE_9T8TYlidR5fRDt/pub?gid=0&single=true';
      expect(isValidMapListURL(url)).toBe(false);
    });
  });
});
