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
  truncateForFileName,
  truncateMiddle,
  getBaseName,
  findPhotoFileKey,
  findDictionaryFileKey,
  MAX_FILENAME_LABEL_LENGTH,
  MAX_BACKUP_LABEL_LENGTH,
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

describe('truncateForFileName', () => {
  it('returns the name unchanged when within the limit', () => {
    expect(truncateForFileName('layer')).toBe('layer');
    const exact = 'a'.repeat(MAX_FILENAME_LABEL_LENGTH);
    expect(truncateForFileName(exact)).toBe(exact);
  });

  it('truncates names longer than the limit', () => {
    const longName = 'a'.repeat(MAX_FILENAME_LABEL_LENGTH + 10);
    const result = truncateForFileName(longName);
    expect(result).toHaveLength(MAX_FILENAME_LABEL_LENGTH);
    expect(result).toBe('a'.repeat(MAX_FILENAME_LABEL_LENGTH));
  });

  it('handles Japanese (multibyte) names by character count', () => {
    const jp = 'あ'.repeat(MAX_FILENAME_LABEL_LENGTH + 5);
    const result = truncateForFileName(jp);
    expect(result).toHaveLength(MAX_FILENAME_LABEL_LENGTH);
    expect(result).toBe('あ'.repeat(MAX_FILENAME_LABEL_LENGTH));
  });

  it('respects a custom maxLen', () => {
    expect(truncateForFileName('abcdef', 3)).toBe('abc');
    expect(truncateForFileName('ab', 3)).toBe('ab');
  });

  it('handles empty string', () => {
    expect(truncateForFileName('')).toBe('');
  });
});

describe('truncateMiddle', () => {
  it('returns the name unchanged when within the limit', () => {
    expect(truncateMiddle('layer', 38)).toBe('layer');
    const exact = 'a'.repeat(MAX_BACKUP_LABEL_LENGTH);
    expect(truncateMiddle(exact)).toBe(exact);
  });

  it('keeps head and tail with a marker when too long', () => {
    const name = '先頭部分_対象事業実施区域_中間の説明がとても長い部分_末尾の枝番_251120';
    const r = truncateMiddle(name, 20);
    expect(r.length).toBe(20);
    expect(r).toContain('…');
    expect(r.startsWith('先頭部分')).toBe(true);
    // 区別に重要な末尾（枝番）が残る
    expect(r.endsWith('251120')).toBe(true);
  });

  it('preserves both ends so similar names stay distinguishable', () => {
    const base = '小田野沢_対象事業実施区域_251107配置から300mバッファー_から300mバッファー_';
    const a = truncateMiddle(base + '現地調査用_251120', 38);
    const b = truncateMiddle(base + '251118', 38);
    expect(a).not.toBe(b);
    expect(a.endsWith('251120')).toBe(true);
    expect(b.endsWith('251118')).toBe(true);
  });

  it('falls back to a simple slice for very small maxLen', () => {
    expect(truncateMiddle('abcdef', 2)).toBe('ab');
  });
});

describe('getBaseName', () => {
  it('returns the last path segment', () => {
    expect(getBaseName('folder_123/photo.jpg')).toBe('photo.jpg');
    expect(getBaseName('a/b/c/file.geojson')).toBe('file.geojson');
  });

  it('returns the input when there is no separator', () => {
    expect(getBaseName('photo.jpg')).toBe('photo.jpg');
  });

  it('handles trailing slash', () => {
    expect(getBaseName('folder/')).toBe('');
  });
});

describe('findPhotoFileKey / findDictionaryFileKey (zip import compatibility)', () => {
  const layerId = '01H8XYZABCDEFGHIJKLMNOPQRS';
  // 旧フォーマット: 完全なレイヤ名フォルダ（切り詰めなし）
  const oldFormatKeys = [
    'local_2024-01-01_00-00-00.json',
    `とても長いレイヤ名がここに続く完全な名前_${layerId}/とても長いレイヤ名がここに続く完全な名前_2024-01-01_00-00-00.json`,
    `とても長いレイヤ名がここに続く完全な名前_${layerId}/とても長いレイヤ名がここに続く完全な名前_2024-01-01_00-00-00.sqlite`,
    `とても長いレイヤ名がここに続く完全な名前_${layerId}/photo001.jpg`,
  ];
  // 新フォーマット: フォルダ名は「中略レイヤ名_ULID」、データファイル名は「中略レイヤ名.ext」
  const newFormatKeys = [
    'local_2024-01-01_00-00-00.json',
    `とても長いレイヤ名_${layerId}/とても長いレイヤ名.json`,
    `とても長いレイヤ名_${layerId}/とても長いレイヤ名.sqlite`,
    `とても長いレイヤ名_${layerId}/photo001.jpg`,
  ];

  it('finds the photo by layer.id and base name in OLD format', () => {
    expect(findPhotoFileKey(oldFormatKeys, layerId, 'photo001.jpg')).toBe(
      `とても長いレイヤ名がここに続く完全な名前_${layerId}/photo001.jpg`
    );
  });

  it('finds the photo by layer.id and base name in NEW format', () => {
    expect(findPhotoFileKey(newFormatKeys, layerId, 'photo001.jpg')).toBe(
      `とても長いレイヤ名_${layerId}/photo001.jpg`
    );
  });

  it('returns undefined when the photo is missing', () => {
    expect(findPhotoFileKey(newFormatKeys, layerId, 'notexist.jpg')).toBeUndefined();
  });

  it('does not match a photo belonging to a different layer', () => {
    expect(findPhotoFileKey(newFormatKeys, 'OTHER_LAYER_ID', 'photo001.jpg')).toBeUndefined();
  });

  it('finds the sqlite dictionary by layer.id in OLD format', () => {
    expect(findDictionaryFileKey(oldFormatKeys, layerId)).toBe(
      `とても長いレイヤ名がここに続く完全な名前_${layerId}/とても長いレイヤ名がここに続く完全な名前_2024-01-01_00-00-00.sqlite`
    );
  });

  it('finds the sqlite dictionary by layer.id in NEW format', () => {
    expect(findDictionaryFileKey(newFormatKeys, layerId)).toBe(
      `とても長いレイヤ名_${layerId}/とても長いレイヤ名.sqlite`
    );
  });

  it('returns undefined when there is no sqlite for the layer', () => {
    const keysWithoutSqlite = newFormatKeys.filter((k) => !k.endsWith('.sqlite'));
    expect(findDictionaryFileKey(keysWithoutSqlite, layerId)).toBeUndefined();
  });
});
