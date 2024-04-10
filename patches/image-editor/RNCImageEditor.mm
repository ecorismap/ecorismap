/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

#import "RNCImageEditor.h"

#import <UIKit/UIKit.h>

#import <React/RCTConvert.h>
#import <React/RCTLog.h>
#import <React/RCTUtils.h>

#import "RNCFileSystem.h"
#import "RNCImageUtils.h"
#import <React/RCTImageLoader.h>
#import <React/RCTImageStoreManager.h>
#if __has_include(<RCTImage/RCTImageUtils.h>)
#import <RCTImage/RCTImageUtils.h>
#else
#import <React/RCTImageUtils.h>
#endif

@implementation RNCImageEditor

RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

/**
 * Crops an image and saves the result to temporary file. Consider using
 * CameraRoll API or other third-party module to save it in gallery.
 *
 * @param imageRequest An image URL
 * @param cropData Dictionary with `offset`, `size` and `displaySize`.
 *        `offset` and `size` are relative to the full-resolution image size.
 *        `displaySize` is an optimization - if specified, the image will
 *        be scaled down to `displaySize` rather than `size`.
 *        All units are in px (not points).
 */
#ifdef RCT_NEW_ARCH_ENABLED
- (void)cropImage:(NSString *)uri
         cropData:(JS::NativeRNCImageEditor::SpecCropImageCropData &)data
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
  CGSize size = [RCTConvert CGSize:@{
    @"width" : @(data.size().width()),
    @"height" : @(data.size().height())
  }];
  CGPoint offset = [RCTConvert
      CGPoint:@{@"x" : @(data.offset().x()), @"y" : @(data.offset().y())}];
  CGSize targetSize = size;
  if (data.displaySize().has_value()) {
    JS::NativeRNCImageEditor::SpecCropImageCropDataDisplaySize displaySize =
        *data.displaySize(); // Extract the value from the optional
    // in pixels
    targetSize = [RCTConvert CGSize:@{
      @"width" : @(displaySize.width()),
      @"height" : @(displaySize.height())
    }];
  }
  NSString *displaySize = data.resizeMode();
  NSURLRequest *imageRequest =
      [NSURLRequest requestWithURL:[NSURL URLWithString:uri]];
  CGFloat compressionQuality = 1;
  if (data.quality().has_value()) {
    compressionQuality = *data.quality();
  }
#else
RCT_EXPORT_METHOD(cropImage
                  : (NSURLRequest *)imageRequest cropData
                  : (NSDictionary *)cropData resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject) {
  CGSize size = [RCTConvert CGSize:cropData[@"size"]];
  CGPoint offset = [RCTConvert CGPoint:cropData[@"offset"]];
  CGSize targetSize = size;
  NSString *displaySize = cropData[@"resizeMode"];
  if (displaySize) {
    targetSize = [RCTConvert CGSize:cropData[@"displaySize"]];
  }

  CGFloat compressionQuality = 1;
  if (cropData[@"quality"]) {
    compressionQuality = [RCTConvert CGFloat:cropData[@"quality"]];
  }
#endif
  NSURL *url = [imageRequest URL];

  [[_bridge moduleForName:@"ImageLoader" lazilyLoadIfNecessary:YES]
      loadImageWithURLRequest:imageRequest
                     callback:^(NSError *error, UIImage *image) {
                       if (error) {
                         reject(@(error.code).stringValue, error.description,
                                error);
                         return;
                       }
                       if (compressionQuality > 1 || compressionQuality < 0) {
                         reject(RCTErrorUnspecified,
                                @("quality must be a number between 0 and 1"),
                                nil);
                         return;
                       }

                       // Create a new image with a transparent background and
                       // the specified size
                       UIGraphicsBeginImageContextWithOptions(targetSize, NO,
                                                              1.0);
                       CGContextRef context = UIGraphicsGetCurrentContext();
                       CGContextClearRect(context,
                                          CGRectMake(0, 0, targetSize.width,
                                                     targetSize.height));

                       // Calculate the rect to crop the original image

                       CGFloat cropStartX = offset.x < 0 ? 0 : offset.x;
                       CGFloat cropEndX =
                           offset.x + size.width > image.size.width
                               ? image.size.width
                               : offset.x + size.width;
                       CGFloat cropWidth = cropEndX - cropStartX;

                       CGFloat cropStartY = offset.y < 0 ? 0 : offset.y;
                       CGFloat cropEndY =
                           offset.y + size.height > image.size.height
                               ? image.size.height
                               : offset.y + size.height;
                       CGFloat cropHeight = cropEndY - cropStartY;

                       if (cropWidth < 0 || cropHeight < 0) {
                         reject(RCTErrorUnspecified, @"Invalid crop rectangle",
                                nil);
                         return;
                       }
                       CGRect cropRect =
                           CGRectMake(MAX(offset.x, 0), MAX(offset.y, 0),
                                      cropWidth, cropHeight);
                       CGImageRef imageRef = CGImageCreateWithImageInRect(
                           [image CGImage], cropRect);
                       UIImage *croppedImage =
                           [UIImage imageWithCGImage:imageRef];

                       // Draw the cropped image on the transparent background
                       CGFloat scaleX = targetSize.width / size.width;
                       CGFloat scaleY = targetSize.height / size.height;

                       CGRect drawRect = CGRectMake(
                           (offset.x < 0 ? fabs(offset.x) : 0) *
                               scaleX, // X座標をスケーリング
                           (offset.y < 0 ? fabs(offset.y) : 0) *
                               scaleY, // Y座標をスケーリング
                           croppedImage.size.width * scaleX, // 幅をスケーリング
                           croppedImage.size.height *
                               scaleY // 高さをスケーリング
                       );

                       [croppedImage drawInRect:drawRect];
                       UIImage *finalImage =
                           UIGraphicsGetImageFromCurrentImageContext();
                       UIGraphicsEndImageContext();

                       CGImageRelease(imageRef);

                       // Continue with the original code to scale the image if
                       // necessary and save it Scale image
                       UIImage *imageToSave = finalImage;

                       // Store image
                       NSString *path = NULL;
                       NSData *imageData = NULL;
                       NSString *extension = [url pathExtension];

                       if ([extension isEqualToString:@"png"]) {
                         imageData = UIImagePNGRepresentation(imageToSave);
                       } else {
                         imageData = UIImageJPEGRepresentation(
                             imageToSave, compressionQuality);
                       }

                       path = [RNCFileSystem
                           generatePathInDirectory:
                               [[RNCFileSystem cacheDirectoryPath]
                                   stringByAppendingPathComponent:
                                       @"ReactNative_cropped_image_"]
                                     withExtension:
                                         extension.length > 0
                                             ? [@"." stringByAppendingString:
                                                         extension]
                                             : @".jpg"];

                       NSError *writeError = nil;
                       NSString *uri = [RNCImageUtils writeImage:imageData
                                                          toPath:path
                                                           error:&writeError];

                       if (writeError) {
                         reject(@(writeError.code).stringValue,
                                writeError.localizedDescription, writeError);
                         return;
                       }

                       resolve(uri);
                     }];
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRNCImageEditorSpecJSI>(params);
}
#endif

@end
