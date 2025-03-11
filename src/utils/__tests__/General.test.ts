import {
  nearDegree,
  splitStringsIntoChunksOfLen,
  isPlotTool,
  isFreehandTool,
  isPointTool,
  isLineTool,
  isPolygonTool,
  getExt,
  isPenTool,
  isBrushTool,
  isStampTool,
  isEraserTool,
  isMapMemoDrawTool,
  toPixel,
  toPoint,
  toPDFCoordinate,
  isLocationType,
  isLocationTypeArray,
} from '../General';
import { POINTTOOL, LINETOOL, POLYGONTOOL, BRUSH, STAMP, ERASER } from '../../constants/AppConstants';

describe('nearDegree', () => {
  it('return nearDegree by interval value 5', () => {
    expect(nearDegree(0, 5)).toBe(0);
    expect(nearDegree(5, 5)).toBe(5);
    expect(nearDegree(1.1, 5)).toBe(0);
    expect(nearDegree(4.1, 5)).toBe(5);
    expect(nearDegree(2.5, 5)).toBe(5);
    expect(nearDegree(42.6, 5)).toBe(45);
    expect(nearDegree(-5, 5)).toBe(-5);
    expect(nearDegree(-1.1, 5)).toBe(-0);
    expect(nearDegree(-4.1, 5)).toBe(-5);
    expect(nearDegree(-2.5, 5)).toBe(-5);
    expect(nearDegree(-42.6, 5)).toBe(-45);
  });

  it('return nearDegree by interval value 2', () => {
    expect(nearDegree(0, 2)).toBe(0);
    expect(nearDegree(5, 2)).toBe(6);
    expect(nearDegree(1.1, 2)).toBe(2);
    expect(nearDegree(4.1, 2)).toBe(4);
    expect(nearDegree(2.5, 2)).toBe(2);
    expect(nearDegree(42.6, 2)).toBe(42);
    expect(nearDegree(-5, 2)).toBe(-6);
    expect(nearDegree(-1.1, 2)).toBe(-2);
    expect(nearDegree(-4.1, 2)).toBe(-4);
    expect(nearDegree(-2.5, 2)).toBe(-2);
    expect(nearDegree(-42.6, 2)).toBe(-42);
  });
});

describe('splitStringsIntoChunksOfLen', () => {
  it('splits string into chunks of specified length', () => {
    expect(splitStringsIntoChunksOfLen('abcdefghi', 3)).toEqual(['abc', 'def', 'ghi']);
    expect(splitStringsIntoChunksOfLen('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
    expect(splitStringsIntoChunksOfLen('', 3)).toEqual([]);
    expect(splitStringsIntoChunksOfLen('abc', 5)).toEqual(['abc']);
  });
});

describe('isPlotTool', () => {
  it('returns true for plot tools', () => {
    expect(isPlotTool('PLOT_POINT')).toBe(true);
    expect(isPlotTool('PLOT_LINE')).toBe(true);
    expect(isPlotTool('PLOT_POLYGON')).toBe(true);
  });

  it('returns false for non-plot tools', () => {
    expect(isPlotTool('FREEHAND_LINE')).toBe(false);
    expect(isPlotTool('PEN')).toBe(false);
    expect(isPlotTool('')).toBe(false);
  });
});

describe('isFreehandTool', () => {
  it('returns true for freehand tools', () => {
    expect(isFreehandTool('FREEHAND_LINE')).toBe(true);
    expect(isFreehandTool('FREEHAND_POLYGON')).toBe(true);
  });

  it('returns false for non-freehand tools', () => {
    expect(isFreehandTool('PLOT_POINT')).toBe(false);
    expect(isFreehandTool('PEN')).toBe(false);
    expect(isFreehandTool('')).toBe(false);
  });
});

describe('getExt', () => {
  it('returns file extension', () => {
    expect(getExt('file.txt')).toBe('txt');
    expect(getExt('image.jpg')).toBe('jpg');
    expect(getExt('archive.tar.gz')).toBe('gz');
    expect(getExt('file')).toBe('');
    expect(getExt('.gitignore')).toBe('gitignore');
    expect(getExt('')).toBe('');
  });
});

describe('isPointTool', () => {
  it('returns true for point tools', () => {
    // Test with actual keys from POINTTOOL
    Object.keys(POINTTOOL).forEach((tool) => {
      expect(isPointTool(tool)).toBe(true);
    });
  });

  it('returns false for non-point tools', () => {
    expect(isPointTool('FREEHAND_LINE')).toBe(false);
    expect(isPointTool('PEN')).toBe(false);
    expect(isPointTool('')).toBe(false);
  });
});

describe('isLineTool', () => {
  it('returns true for line tools', () => {
    // Test with actual keys from LINETOOL
    Object.keys(LINETOOL).forEach((tool) => {
      expect(isLineTool(tool)).toBe(true);
    });
  });

  it('returns false for non-line tools', () => {
    expect(isLineTool('PLOT_POINT')).toBe(false);
    expect(isLineTool('PEN')).toBe(false);
    expect(isLineTool('')).toBe(false);
  });
});

describe('isPolygonTool', () => {
  it('returns true for polygon tools', () => {
    // Test with actual keys from POLYGONTOOL
    Object.keys(POLYGONTOOL).forEach((tool) => {
      expect(isPolygonTool(tool)).toBe(true);
    });
  });

  it('returns false for non-polygon tools', () => {
    expect(isPolygonTool('PLOT_POINT')).toBe(false);
    expect(isPolygonTool('PEN')).toBe(false);
    expect(isPolygonTool('')).toBe(false);
  });
});

describe('isPenTool', () => {
  it('returns true for PEN tool', () => {
    expect(isPenTool('PEN')).toBe(true);
  });

  it('returns false for non-PEN tools', () => {
    expect(isPenTool('PLOT_POINT')).toBe(false);
    expect(isPenTool('')).toBe(false);
  });
});

describe('isBrushTool', () => {
  it('returns true for brush tools', () => {
    // Test with actual keys from BRUSH
    Object.keys(BRUSH).forEach((tool) => {
      expect(isBrushTool(tool)).toBe(true);
    });
  });

  it('returns false for non-brush tools', () => {
    expect(isBrushTool('PLOT_POINT')).toBe(false);
    expect(isBrushTool('PEN')).toBe(false);
    expect(isBrushTool('')).toBe(false);
  });
});

describe('isStampTool', () => {
  it('returns true for stamp tools', () => {
    // Test with actual keys from STAMP
    Object.keys(STAMP).forEach((tool) => {
      expect(isStampTool(tool)).toBe(true);
    });
  });

  it('returns false for non-stamp tools', () => {
    expect(isStampTool('PLOT_POINT')).toBe(false);
    expect(isStampTool('PEN')).toBe(false);
    expect(isStampTool('')).toBe(false);
  });
});

describe('isEraserTool', () => {
  it('returns true for eraser tools', () => {
    // Test with actual keys from ERASER
    Object.keys(ERASER).forEach((tool) => {
      expect(isEraserTool(tool)).toBe(true);
    });
  });

  it('returns false for non-eraser tools', () => {
    expect(isEraserTool('PLOT_POINT')).toBe(false);
    expect(isEraserTool('PEN')).toBe(false);
    expect(isEraserTool('')).toBe(false);
  });
});

describe('isMapMemoDrawTool', () => {
  it('returns true for map memo draw tools', () => {
    // We'll test with the actual implementation
    // PEN is directly checked in the implementation
    expect(isMapMemoDrawTool('PEN')).toBe(true);
  });

  it('returns false for non-map memo draw tools', () => {
    expect(isMapMemoDrawTool('PLOT_POINT')).toBe(false);
    expect(isMapMemoDrawTool('FREEHAND_LINE')).toBe(false);
    expect(isMapMemoDrawTool('')).toBe(false);
  });
});

describe('toPixel', () => {
  it('converts millimeters to pixels', () => {
    expect(toPixel(25.4)).toBe(96); // 1 inch = 25.4mm = 96px
    expect(toPixel(12.7)).toBe(48); // 0.5 inch = 12.7mm = 48px
    expect(toPixel(0)).toBe(0);
  });
});

describe('toPoint', () => {
  it('converts millimeters to points', () => {
    expect(toPoint(25.4)).toBe(72); // 1 inch = 25.4mm = 72pt
    expect(toPoint(12.7)).toBe(36); // 0.5 inch = 12.7mm = 36pt
    expect(toPoint(0)).toBe(0);
  });
});

describe('toPDFCoordinate', () => {
  it('converts millimeters to PDF coordinates', () => {
    expect(toPDFCoordinate(25.4)).toBe(150); // 1 inch = 25.4mm = 150 PDF units
    expect(toPDFCoordinate(12.7)).toBe(75); // 0.5 inch = 12.7mm = 75 PDF units
    expect(toPDFCoordinate(0)).toBe(0);
  });
});

describe('isLocationType', () => {
  it('returns true for LocationType objects', () => {
    expect(isLocationType({ latitude: 35.0, longitude: 135.0 })).toBe(true);
  });

  it('returns false for non-LocationType values', () => {
    expect(isLocationType(undefined)).toBe(false);
    expect(isLocationType([])).toBe(false);
    expect(isLocationType([{ latitude: 35.0, longitude: 135.0 }])).toBe(false);
    // @ts-ignore - Testing with invalid object
    expect(isLocationType({ other: 'property' })).toBe(false);
  });
});

describe('isLocationTypeArray', () => {
  it('returns true for LocationType arrays', () => {
    expect(isLocationTypeArray([{ latitude: 35.0, longitude: 135.0 }])).toBe(true);
    expect(
      isLocationTypeArray([
        { latitude: 35.0, longitude: 135.0 },
        { latitude: 36.0, longitude: 136.0 },
      ])
    ).toBe(true);
  });

  it('returns false for non-LocationType arrays', () => {
    expect(isLocationTypeArray(undefined)).toBe(false);
    expect(isLocationTypeArray([])).toBe(false);
    expect(isLocationTypeArray({ latitude: 35.0, longitude: 135.0 })).toBe(false);
    // @ts-ignore - Testing with invalid object
    expect(isLocationTypeArray([{ other: 'property' }])).toBe(false);
  });
});
