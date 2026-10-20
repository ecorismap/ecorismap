//
//  iOS 側のスタイル式評価器（StyleExpression / CssColor）を、共通フィクスチャで検証する CLI ランナー。
//  Foundation だけでビルドして macOS 上で動かす（Xcode プロジェクトには手を入れない）。
//
//  使い方: scripts/native-tests/run-ios.sh
//

#import <Foundation/Foundation.h>
#import "StyleExpression.h"

static BOOL numbersClose(double a, double b) {
  if (a == b) return YES;
  double diff = fabs(a - b);
  return diff <= 1e-9 || diff <= 1e-12 * MAX(fabs(a), fabs(b));
}

static BOOL isJsonBool(id v) {
  return [v isKindOfClass:[NSNumber class]] && CFGetTypeID((__bridge CFTypeRef)v) == CFBooleanGetTypeID();
}

/// expected（フィクスチャの JSON 値）と actual（評価器の戻り値）を比較する
static BOOL valuesMatch(id expected, id actual, NSString **why) {
  if (expected == nil || expected == [NSNull null]) {
    if (actual == nil || actual == [NSNull null]) return YES;
    *why = [NSString stringWithFormat:@"expected null, got %@", actual];
    return NO;
  }
  if ([expected isKindOfClass:[NSDictionary class]] && expected[@"$color"]) {
    if (![actual isKindOfClass:[CssColor class]]) {
      *why = [NSString stringWithFormat:@"expected color %@, got %@", expected[@"$color"], actual];
      return NO;
    }
    NSArray *c = expected[@"$color"];
    CssColor *a = actual;
    double comps[4] = {a.r, a.g, a.b, a.a};
    for (int i = 0; i < 4; i++) {
      if (fabs([c[i] doubleValue] - comps[i]) > 1e-6) {
        *why = [NSString stringWithFormat:@"expected color %@, got %@", c, a];
        return NO;
      }
    }
    return YES;
  }
  if (isJsonBool(expected)) {
    if (!isJsonBool(actual) || [expected boolValue] != [actual boolValue]) {
      *why = [NSString stringWithFormat:@"expected bool %@, got %@", expected, actual];
      return NO;
    }
    return YES;
  }
  if ([expected isKindOfClass:[NSNumber class]]) {
    if (![actual isKindOfClass:[NSNumber class]] || isJsonBool(actual) ||
        !numbersClose([expected doubleValue], [actual doubleValue])) {
      *why = [NSString stringWithFormat:@"expected number %@, got %@", expected, actual];
      return NO;
    }
    return YES;
  }
  if ([expected isKindOfClass:[NSString class]]) {
    if (![actual isKindOfClass:[NSString class]] || ![expected isEqualToString:actual]) {
      *why = [NSString stringWithFormat:@"expected string \"%@\", got %@", expected, actual];
      return NO;
    }
    return YES;
  }
  if ([expected isKindOfClass:[NSArray class]]) {
    if (![actual isKindOfClass:[NSArray class]] || [expected count] != [actual count]) {
      *why = [NSString stringWithFormat:@"expected array %@, got %@", expected, actual];
      return NO;
    }
    for (NSUInteger i = 0; i < [expected count]; i++) {
      if (!valuesMatch(expected[i], actual[i], why)) return NO;
    }
    return YES;
  }
  if ([expected isKindOfClass:[NSDictionary class]]) {
    if (![actual isKindOfClass:[NSDictionary class]] || [expected count] != [actual count]) {
      *why = [NSString stringWithFormat:@"expected object %@, got %@", expected, actual];
      return NO;
    }
    for (NSString *key in expected) {
      if (!valuesMatch(expected[key], actual[key], why)) return NO;
    }
    return YES;
  }
  *why = @"unsupported expected type";
  return NO;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: %s <vectorStyleExpressions.json>\n", argv[0]);
      return 2;
    }
    NSString *path = [NSString stringWithUTF8String:argv[1]];
    NSData *data = [NSData dataWithContentsOfFile:path];
    if (!data) {
      fprintf(stderr, "cannot read %s\n", argv[1]);
      return 2;
    }
    NSError *error = nil;
    NSDictionary *doc = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (!doc) {
      fprintf(stderr, "invalid json: %s\n", error.localizedDescription.UTF8String);
      return 2;
    }
    NSArray *cases = doc[@"cases"];
    NSUInteger pass = 0, fail = 0;
    for (NSDictionary *c in cases) {
      NSString *kind = c[@"kind"];
      NSDictionary *properties = c[@"properties"] ?: @{};
      id featureId = c[@"featureId"];
      EvalContext *ctx = [[EvalContext alloc] initWithProperties:properties
                                                    geometryType:c[@"geometryType"]
                                                       featureId:featureId
                                                            zoom:[c[@"zoom"] doubleValue]];
      BOOL expectError = [c[@"expectedError"] boolValue];
      BOOL ok = YES;
      NSString *why = nil;
      if ([kind isEqualToString:@"expression"]) {
        id actual = [StyleExpression evaluate:c[@"expression"] context:ctx];
        if (expectError) {
          ok = [StyleExpression isError:actual];
          if (!ok) why = [NSString stringWithFormat:@"expected error, got %@", actual];
        } else if ([StyleExpression isError:actual]) {
          ok = NO;
          why = [NSString stringWithFormat:@"expected %@, got error", c[@"expected"]];
        } else {
          ok = valuesMatch(c[@"expected"], actual, &why);
        }
      } else if ([kind isEqualToString:@"color"]) {
        CssColor *actual = [CssColor parse:c[@"expression"]];
        if (expectError) {
          ok = actual == nil;
          if (!ok) why = [NSString stringWithFormat:@"expected parse failure, got %@", actual];
        } else if (!actual) {
          ok = NO;
          why = [NSString stringWithFormat:@"expected %@, got nil", c[@"expected"]];
        } else {
          ok = valuesMatch(c[@"expected"], actual, &why);
        }
      } else if ([kind isEqualToString:@"filter"]) {
        id normalized = [StyleExpression normalizeFilter:c[@"filter"]];
        BOOL actual = [StyleExpression evalFilter:normalized context:ctx];
        BOOL expected = expectError ? NO : [c[@"expected"] boolValue];
        ok = actual == expected;
        if (!ok) why = [NSString stringWithFormat:@"expected %@, got %@ (normalized: %@)", expected ? @"true" : @"false",
                                                  actual ? @"true" : @"false", normalized];
      } else {
        ok = NO;
        why = [NSString stringWithFormat:@"unknown kind %@", kind];
      }
      if (ok) {
        pass++;
      } else {
        fail++;
        id input = c[@"expression"] ?: c[@"filter"];
        NSData *inputJson = [NSJSONSerialization dataWithJSONObject:@[ input ?: [NSNull null] ] options:0 error:nil];
        NSString *inputStr = [[NSString alloc] initWithData:inputJson encoding:NSUTF8StringEncoding];
        printf("FAIL %s %s props=%s: %s\n", [c[@"id"] UTF8String], inputStr.UTF8String,
               [[NSString stringWithFormat:@"%@", properties] UTF8String], why.UTF8String);
      }
    }
    printf("%lu passed, %lu failed (of %lu)\n", (unsigned long)pass, (unsigned long)fail, (unsigned long)cases.count);
    return fail == 0 ? 0 : 1;
  }
}
