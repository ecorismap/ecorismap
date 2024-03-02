#import "Gdalwarp.h"
#import "cpl_conv.h"  // for CPLMalloc()
#include "cpl_conv.h" // for CPLMalloc()
#import "cpl_csv.h"
#import "cpl_error.h"
#import "cpl_minixml.h"
#import "cpl_multiproc.h"
#import "cpl_port.h"
#import "cpl_string.h"
#import "cpl_vsi.h"
#import "gdal.h"
#import "gdal_utils.h"
#import "gdalwarper.h"
#import "gdalwarper.h" // for GDAL Warp API
#import "ogr_spatialref.h"
#import "ogr_srs_api.h"
@implementation Gdalwarp
RCT_EXPORT_MODULE()

// Example method
// See // https://reactnative.dev/docs/native-modules-ios
RCT_EXPORT_METHOD(convert
                  : (NSString *)uri resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject) {
  NSString *resourcePath = [[NSBundle mainBundle] resourcePath];
  NSString *projLibPath = [resourcePath stringByAppendingPathComponent:@"proj"];
  setenv("PROJ_LIB", [projLibPath cStringUsingEncoding:NSASCIIStringEncoding],
         1);
  NSString *gdalDataPath =
      [resourcePath stringByAppendingPathComponent:@"gdal"];
  setenv("GDAL_DATA", [gdalDataPath cStringUsingEncoding:NSASCIIStringEncoding],
         1);
  NSString *extension = [uri pathExtension];
  if ([extension isEqualToString:@"pdf"]) {
    [self convertMultiPDFToPNG:uri resolve:resolve reject:reject];
  } else if ([extension isEqualToString:@"xml"]) {
    [self generateGeoPDF:uri resolve:resolve reject:reject];
  } else {
    reject(@"E_CONVERT_ERROR", @"Unsupported file format.", nil);
  }
}

- (NSMutableDictionary *)getOutputFileInfo:(GDALDatasetH)dataset
                                outputPath:(NSString *)outputPath {
  double adfGeoTransform[6];
  if (GDALGetGeoTransform(dataset, adfGeoTransform) == CE_None) {
    // Calculate top-left and bottom-right coordinates
    double topLeftX = adfGeoTransform[0];
    double topLeftY = adfGeoTransform[3];
    int xSize = GDALGetRasterXSize(dataset);
    int ySize = GDALGetRasterYSize(dataset);
    double bottomRightX = adfGeoTransform[0] + adfGeoTransform[1] * xSize;
    double bottomRightY = adfGeoTransform[3] + adfGeoTransform[5] * ySize;

    // NSLog(@"topLeftX: %f, topLeftY: %f, bottomRightX: %f, bottomRightY: %f",
    //       topLeftX, topLeftY, bottomRightX, bottomRightY);
    // NSLog(@"xSize: %d, ySize: %d", xSize, ySize);
    NSMutableDictionary *fileInfo = [NSMutableDictionary dictionary];
    fileInfo[@"uri"] = outputPath;
    fileInfo[@"width"] = @(GDALGetRasterXSize(dataset));
    fileInfo[@"height"] = @(GDALGetRasterYSize(dataset));
    fileInfo[@"topLeft"] = @{@"x" : @(topLeftX), @"y" : @(topLeftY)};
    fileInfo[@"bottomRight"] =
        @{@"x" : @(bottomRightX), @"y" : @(bottomRightY)};

    return fileInfo;
  }

  return nil;
}

- (NSMutableDictionary *)convetPDFToPNG:(NSString *)inputPath
                             outputPath:(NSString *)outputPath {

  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    [fileManager removeItemAtPath:outputPath error:nil];
  }

  GDALDatasetH hSubDataset = GDALOpen(inputPath.UTF8String, GA_ReadOnly);
  if (hSubDataset == NULL) {
    return nil;
  }

  char *pszSrcWKT = (char *)GDALGetProjectionRef(hSubDataset);
  OGRSpatialReferenceH hSRS = OSRNewSpatialReference(NULL);
  OSRSetFromUserInput(hSRS, "EPSG:3857");
  char *pszDstWKT = NULL;
  OSRExportToWkt(hSRS, &pszDstWKT);

  GDALDatasetH hDstDS = GDALAutoCreateWarpedVRT(
      hSubDataset, pszSrcWKT, pszDstWKT, GRA_Lanczos, 0.125, NULL);
  GDALDriverH hDstDriver = GDALGetDriverByName("PNG");
  GDALDatasetH hDstDS2 = GDALCreateCopy(hDstDriver, outputPath.UTF8String,
                                        hDstDS, FALSE, NULL, NULL, NULL);

  GDALClose(hDstDS);
  GDALClose(hSubDataset);
  if (!hDstDS2) {
    return nil;
  }

  NSMutableDictionary *fileInfo = [self getOutputFileInfo:hDstDS2
                                               outputPath:outputPath];
  GDALClose(hDstDS2);

  return fileInfo;
}

- (void)convertMultiPDFToPNG:(NSString *)uri
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject {
  CPLSetConfigOption("GDAL_PDF_DPI", "300");
  GDALAllRegister();

  // Subdatasetsの取得
  GDALDatasetH hInputDataset = GDALOpen(uri.UTF8String, GA_ReadOnly);
  if (hInputDataset == NULL) {
    reject(@"E_CONVERT_ERROR", @"Failed to open input dataset.", nil);
    return;
  }
  int subdatasetsCount =
      CSLCount(GDALGetMetadata(hInputDataset, "SUBDATASETS")) / 2;
  // char **papszSubdatasets = GDALGetMetadata(hInputDataset, "SUBDATASETS");
  // for (int i = 0; i < subdatasetsCount; i++) {
  //   NSLog(@"papszSubdatasets[%d]: %s", i, papszSubdatasets[i]);
  // }
  // NSLog(@"subdatasetsCount: %d", subdatasetsCount);
  GDALClose(hInputDataset);
  ///////////////////////////

  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  NSMutableArray *outputFiles = [NSMutableArray array];
  if (subdatasetsCount == 0) {

    NSString *outputPath = [uri stringByReplacingOccurrencesOfString:@".pdf"
                                                          withString:@".png"];
    NSMutableDictionary *fileInfo = [self convetPDFToPNG:uri
                                              outputPath:outputPath];
    if (fileInfo) {
      [outputFiles addObject:fileInfo];
    }

  } else {
    for (int i = 1; i <= subdatasetsCount; i++) {
      // PDF:1:をuriにつけてサブデータセットを指定
      NSString *inputPath =
          [NSString stringWithFormat:@"%@:%d:%@", @"PDF", i, uri];

      // const char *inputFilename = uri.UTF8String;
      NSString *outputPath = [uri
          stringByReplacingOccurrencesOfString:@".pdf"
                                    withString:[NSString
                                                   stringWithFormat:@"_%d.png",
                                                                    i]];

      // NSLog(@"inputPath: %@", inputPath);
      NSMutableDictionary *fileInfo = [self convetPDFToPNG:inputPath
                                                outputPath:outputPath];

      if (fileInfo) {
        [outputFiles addObject:fileInfo];
      }
    }
  }
  GDALDestroyDriverManager();
  result[@"outputFiles"] = outputFiles;
  resolve(result);
}

- (void)generateGeoPDF:(NSString *)uri
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject {
  GDALAllRegister();

  NSString *outputPath = [uri stringByReplacingOccurrencesOfString:@".xml"
                                                        withString:@"_out.pdf"];
  const char *outputFilename = outputPath.UTF8String;

  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    [fileManager removeItemAtPath:outputPath error:nil];
  }

  char **papszCreateOptions = NULL;
  GDALDriverH hDstDriver = GDALGetDriverByName("PDF");

  NSString *compositionFileOption =
      [NSString stringWithFormat:@"COMPOSITION_FILE=%s", uri.UTF8String];
  papszCreateOptions =
      CSLAddString(papszCreateOptions, [compositionFileOption UTF8String]);
  GDALDatasetH hDataset = GDALCreate(hDstDriver, outputFilename, 0, 0, 0,
                                     GDT_Unknown, papszCreateOptions);
  GDALDatasetH hDstDS = GDALOpen(outputFilename, GA_ReadOnly);

  if (!hDstDS) {
    reject(@"E_CONVERT_ERROR", @"Failed to create output dataset.", nil);
    return;
  }
  // GDALDriverH hDriver = GDALGetDatasetDriver(hDstDS);
  // NSLog(@"Driver: %s/%s", GDALGetDriverShortName(hDriver),
  //       GDALGetDriverLongName(hDriver));
  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  NSMutableArray *outputFiles = [NSMutableArray array];
  NSMutableDictionary *fileInfo = [self getOutputFileInfo:hDstDS
                                               outputPath:outputPath];
  CSLDestroy(papszCreateOptions);
  papszCreateOptions = NULL;
  GDALClose(hDstDS);
  GDALClose(hDataset);
  GDALDestroyDriverManager();

  if (fileInfo) {
    [outputFiles addObject:fileInfo];
    result[@"outputFiles"] = outputFiles;
    resolve(result);
  } else {
    reject(@"E_CONVERT_ERROR", @"Failed to get geotransform.", nil);
  }
}
@end
