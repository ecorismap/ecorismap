import {
  ViewportBounds,
  expandBounds,
  isPointInBounds,
  isLineIntersectsBounds,
  isPolygonIntersectsBounds,
  cullPoints,
  cullLines,
  cullPolygons,
} from '../ViewportCulling';
import { PointRecordType, LineRecordType, PolygonRecordType } from '../../types';

describe('ViewportCulling', () => {
  const defaultBounds: ViewportBounds = {
    northEast: { latitude: 40, longitude: 140 },
    southWest: { latitude: 30, longitude: 130 },
  };

  describe('expandBounds', () => {
    it('should expand bounds by given percentage', () => {
      const expanded = expandBounds(defaultBounds, 10);

      expect(expanded.northEast.latitude).toBeCloseTo(41);
      expect(expanded.northEast.longitude).toBeCloseTo(141);
      expect(expanded.southWest.latitude).toBeCloseTo(29);
      expect(expanded.southWest.longitude).toBeCloseTo(129);
    });

    it('should handle zero buffer', () => {
      const expanded = expandBounds(defaultBounds, 0);

      expect(expanded).toEqual(defaultBounds);
    });

    it('should handle large buffer percentages', () => {
      const expanded = expandBounds(defaultBounds, 100);

      expect(expanded.northEast.latitude).toBeCloseTo(50);
      expect(expanded.northEast.longitude).toBeCloseTo(150);
      expect(expanded.southWest.latitude).toBeCloseTo(20);
      expect(expanded.southWest.longitude).toBeCloseTo(120);
    });
  });

  describe('isPointInBounds', () => {
    it('should return true for point inside bounds', () => {
      const point = { latitude: 35, longitude: 135 };
      expect(isPointInBounds(point, defaultBounds)).toBe(true);
    });

    it('should return false for point outside bounds', () => {
      const point = { latitude: 45, longitude: 145 };
      expect(isPointInBounds(point, defaultBounds)).toBe(false);
    });

    it('should return true for point on boundary', () => {
      const point = { latitude: 40, longitude: 140 };
      expect(isPointInBounds(point, defaultBounds)).toBe(true);
    });

    it('should handle negative coordinates', () => {
      const bounds: ViewportBounds = {
        northEast: { latitude: -20, longitude: -100 },
        southWest: { latitude: -40, longitude: -120 },
      };
      const pointInside = { latitude: -30, longitude: -110 };
      const pointOutside = { latitude: -50, longitude: -110 };

      expect(isPointInBounds(pointInside, bounds)).toBe(true);
      expect(isPointInBounds(pointOutside, bounds)).toBe(false);
    });
  });

  describe('isLineIntersectsBounds', () => {
    it('should return true if any point is in bounds', () => {
      const line = [
        { latitude: 35, longitude: 135 },
        { latitude: 45, longitude: 145 },
      ];
      expect(isLineIntersectsBounds(line, defaultBounds)).toBe(true);
    });

    it('should return false if line is completely outside', () => {
      const line = [
        { latitude: 45, longitude: 145 },
        { latitude: 50, longitude: 150 },
      ];
      expect(isLineIntersectsBounds(line, defaultBounds)).toBe(false);
    });

    it('should return true if line spans bounds', () => {
      const line = [
        { latitude: 25, longitude: 135 },
        { latitude: 45, longitude: 135 },
      ];
      expect(isLineIntersectsBounds(line, defaultBounds)).toBe(true);
    });

    it('should handle empty line', () => {
      expect(isLineIntersectsBounds([], defaultBounds)).toBe(false);
    });

    it('should handle single point line', () => {
      const line = [{ latitude: 35, longitude: 135 }];
      expect(isLineIntersectsBounds(line, defaultBounds)).toBe(true);
    });
  });

  describe('isPolygonIntersectsBounds', () => {
    it('should return true if any point is in bounds', () => {
      const polygon = [
        [
          { latitude: 35, longitude: 135 },
          { latitude: 45, longitude: 145 },
          { latitude: 25, longitude: 125 },
        ],
      ];
      expect(isPolygonIntersectsBounds(polygon, defaultBounds)).toBe(true);
    });

    it('should return false if polygon is completely outside', () => {
      const polygon = [
        [
          { latitude: 45, longitude: 145 },
          { latitude: 50, longitude: 150 },
          { latitude: 45, longitude: 150 },
        ],
      ];
      expect(isPolygonIntersectsBounds(polygon, defaultBounds)).toBe(false);
    });

    it('should return true if polygon contains bounds', () => {
      const polygon = [
        [
          { latitude: 20, longitude: 120 },
          { latitude: 50, longitude: 120 },
          { latitude: 50, longitude: 150 },
          { latitude: 20, longitude: 150 },
        ],
      ];
      expect(isPolygonIntersectsBounds(polygon, defaultBounds)).toBe(true);
    });

    it('should handle polygon with holes', () => {
      const polygon = [
        // Outer ring
        [
          { latitude: 35, longitude: 135 },
          { latitude: 36, longitude: 135 },
          { latitude: 36, longitude: 136 },
          { latitude: 35, longitude: 136 },
        ],
        // Hole
        [
          { latitude: 35.4, longitude: 135.4 },
          { latitude: 35.6, longitude: 135.4 },
          { latitude: 35.6, longitude: 135.6 },
          { latitude: 35.4, longitude: 135.6 },
        ],
      ];
      expect(isPolygonIntersectsBounds(polygon, defaultBounds)).toBe(true);
    });
  });

  describe('cullPoints', () => {
    const createPoint = (lat: number, lng: number): PointRecordType => ({
      id: `${lat}-${lng}`,
      userId: 'test',
      displayName: 'test',
      visible: true,
      redraw: false,
      coords: { latitude: lat, longitude: lng },
      field: {},
    });

    it('should return all points when bounds is null', () => {
      const points = [createPoint(35, 135), createPoint(45, 145)];

      const result = cullPoints(points, null, 10);
      expect(result).toHaveLength(2);
    });

    it('should filter points outside bounds', () => {
      const points = [
        createPoint(35, 135), // inside
        createPoint(45, 145), // outside
        createPoint(32, 132), // inside
      ];

      const result = cullPoints(points, defaultBounds, 10);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('35-135');
      expect(result[1].id).toBe('32-132');
    });

    it('should respect maxFeatures option', () => {
      const points = Array.from({ length: 10 }, (_, i) => createPoint(35 + i * 0.1, 135));

      const result = cullPoints(points, defaultBounds, 10, { maxFeatures: 5 });
      expect(result).toHaveLength(5);
    });

    it('should not cull when zoom is below minZoom', () => {
      const points = [createPoint(35, 135), createPoint(45, 145)];

      const result = cullPoints(points, defaultBounds, 5, { minZoom: 10 });
      expect(result).toHaveLength(2);
    });

    it('should apply buffer correctly', () => {
      const points = [
        createPoint(35, 135), // inside
        createPoint(41, 141), // outside but within 10% buffer
        createPoint(45, 145), // outside buffer
      ];

      const result = cullPoints(points, defaultBounds, 10, { buffer: 10 });
      expect(result).toHaveLength(2);
    });

    it('should handle points with invalid coordinates', () => {
      const points = [
        createPoint(35, 135),
        { ...createPoint(0, 0), coords: null } as any,
        { ...createPoint(0, 0), coords: {} } as any,
      ];

      const result = cullPoints(points, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });
  });

  describe('cullLines', () => {
    const createLine = (coords: Array<[number, number]>): LineRecordType => ({
      id: 'test',
      userId: 'test',
      displayName: 'test',
      visible: true,
      redraw: false,
      coords: coords.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
      field: {},
    });

    it('should return all lines when bounds is null', () => {
      const lines = [
        createLine([
          [35, 135],
          [36, 136],
        ]),
        createLine([
          [45, 145],
          [46, 146],
        ]),
      ];

      const result = cullLines(lines, null, 10);
      expect(result).toHaveLength(2);
    });

    it('should filter lines outside bounds', () => {
      const lines = [
        createLine([
          [35, 135],
          [36, 136],
        ]), // inside
        createLine([
          [45, 145],
          [46, 146],
        ]), // outside
      ];

      const result = cullLines(lines, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });

    it('should include lines that intersect bounds', () => {
      const lines = [
        createLine([
          [25, 135],
          [45, 135],
        ]), // spans bounds
        createLine([
          [45, 145],
          [46, 146],
        ]), // outside
      ];

      const result = cullLines(lines, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });

    it('should handle lines with no coordinates', () => {
      const lines = [
        createLine([
          [35, 135],
          [36, 136],
        ]),
        { ...createLine([]), coords: null } as any,
      ];

      const result = cullLines(lines, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });
  });

  describe('cullPolygons', () => {
    const createPolygon = (coords: Array<[number, number]>, holes?: Record<string, any>): PolygonRecordType => ({
      id: 'test',
      userId: 'test',
      displayName: 'test',
      visible: true,
      redraw: false,
      coords: coords.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
      holes,
      field: {},
    });

    it('should return all polygons when bounds is null', () => {
      const polygons = [
        createPolygon([
          [35, 135],
          [36, 136],
          [35, 136],
        ]),
        createPolygon([
          [45, 145],
          [46, 146],
          [45, 146],
        ]),
      ];

      const result = cullPolygons(polygons, null, 10);
      expect(result).toHaveLength(2);
    });

    it('should filter polygons outside bounds', () => {
      const polygons = [
        createPolygon([
          [35, 135],
          [36, 136],
          [35, 136],
        ]), // inside
        createPolygon([
          [45, 145],
          [46, 146],
          [45, 146],
        ]), // outside
      ];

      const result = cullPolygons(polygons, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });

    it('should handle polygons with holes', () => {
      const polygon = createPolygon(
        [
          [35, 135],
          [36, 136],
          [35, 136],
        ],
        {
          hole1: [
            { latitude: 35.4, longitude: 135.4 },
            { latitude: 35.6, longitude: 135.6 },
            { latitude: 35.4, longitude: 135.6 },
          ],
        }
      );

      const result = cullPolygons([polygon], defaultBounds, 10);
      expect(result).toHaveLength(1);
    });

    it('should handle polygons with no coordinates', () => {
      const polygons = [
        createPolygon([
          [35, 135],
          [36, 136],
          [35, 136],
        ]),
        { ...createPolygon([]), coords: null } as any,
      ];

      const result = cullPolygons(polygons, defaultBounds, 10);
      expect(result).toHaveLength(1);
    });
  });
});
