
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNGdalwarpSpec.h"

@interface Gdalwarp : NSObject <NativeGdalwarpSpec>
#else
#import <React/RCTBridgeModule.h>

@interface Gdalwarp : NSObject <RCTBridgeModule>
#endif

@end
