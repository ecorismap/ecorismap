import CoreGraphics
import ExpoModulesCore
import ImageIO
import libwebp

/**
 標高タイル（WebP/PNG）を標高[m]のFloat32配列へデコードする。

 WebPはlibwebpで直接展開する。UIImage/CGImageを通すと色管理でRGB値が
 変わる恐れがあり、RGBに数値を詰めた標高タイルでは標高が壊れるため。
 */
public class DemDecoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DemDecoder")

    // 非同期関数はモジュールのキュー（JSスレッド外）で実行される。
    // 戻り値は1本のArrayBuffer（コピーなしでJSへ渡せる）: 先頭8個のFloat32（headerFloats）が
    // [width, height, min, max, readMs, decodeMs, convertMs, 予備]、続いて標高[m]が行優先で並ぶ
    AsyncFunction("decodeFile") { (fileUri: String, encoding: String) throws -> NativeArrayBuffer in
      let startNs = DispatchTime.now().uptimeNanoseconds
      let url = fileUri.hasPrefix("file://") ? URL(string: fileUri)! : URL(fileURLWithPath: fileUri)
      let data = try Data(contentsOf: url)
      let readNs = DispatchTime.now().uptimeNanoseconds

      let rgba = isWebp(data) ? try decodeWebp(data) : try decodePng(data)
      let decodedNs = DispatchTime.now().uptimeNanoseconds

      let count = rgba.width * rgba.height
      let raw = UnsafeMutableRawBufferPointer.allocate(
        byteCount: (headerFloats + count) * 4, alignment: MemoryLayout<Float>.alignment)
      let out = raw.bindMemory(to: Float.self)
      var minElev = Float.infinity
      var maxElev = -Float.infinity
      rgba.pixels.withUnsafeBufferPointer { px in
        if encoding == "terrarium" {
          for i in 0..<count {
            let p = i * 4
            let e = Float(px[p]) * 256 + Float(px[p + 1]) + Float(px[p + 2]) / 256 - 32768
            out[headerFloats + i] = e
            if e < minElev { minElev = e }
            if e > maxElev { maxElev = e }
          }
        } else {
          // 国土地理院方式: x = 2^16·R + 2^8·G + B、NoData=2^23、単位0.01m。
          // 透明画素（産総研タイルの整備範囲外）もNoData
          for i in 0..<count {
            let p = i * 4
            let x = Int32(px[p]) << 16 | Int32(px[p + 1]) << 8 | Int32(px[p + 2])
            if x == 8_388_608 || px[p + 3] == 0 {
              out[headerFloats + i] = .nan
              continue
            }
            let e = Float(x < 8_388_608 ? x : x - 16_777_216) / 100
            out[headerFloats + i] = e
            if e < minElev { minElev = e }
            if e > maxElev { maxElev = e }
          }
        }
      }
      let endNs = DispatchTime.now().uptimeNanoseconds

      out[0] = Float(rgba.width)
      out[1] = Float(rgba.height)
      out[2] = minElev.isFinite ? minElev : .nan
      out[3] = maxElev.isFinite ? maxElev : .nan
      out[4] = Float(Double(readNs - startNs) / 1e6)
      out[5] = Float(Double(decodedNs - readNs) / 1e6)
      out[6] = Float(Double(endNs - decodedNs) / 1e6)
      out[7] = 0
      return try NativeArrayBuffer.wrap(dataWithoutCopy: raw) { raw.deallocate() }
    }
  }
}

private let headerFloats = 8

private struct RgbaImage {
  let width: Int
  let height: Int
  let pixels: [UInt8]
}

private func isWebp(_ data: Data) -> Bool {
  data.count > 12 && data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46
}

private func decodeWebp(_ data: Data) throws -> RgbaImage {
  var width: Int32 = 0
  var height: Int32 = 0
  let pixels: [UInt8]? = data.withUnsafeBytes { raw -> [UInt8]? in
    guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return nil }
    guard WebPGetInfo(base, raw.count, &width, &height) != 0 else { return nil }
    var out = [UInt8](repeating: 0, count: Int(width) * Int(height) * 4)
    let ok = out.withUnsafeMutableBufferPointer { dst -> Bool in
      WebPDecodeRGBAInto(base, raw.count, dst.baseAddress, dst.count, width * 4) != nil
    }
    return ok ? out : nil
  }
  guard let pixels else { throw DemDecodeException("WebP decode failed") }
  return RgbaImage(width: Int(width), height: Int(height), pixels: pixels)
}

/**
 PNGはImageIOで展開し、画像自身の色空間のままRGBAへ描き込む（色空間の変換が入らないことは
 画素一致テストで確認済み）。アルファは乗算済みで持つが、標高タイルは不透明（255）か
 完全透明（0=NoData）なので値は変わらない。
 */
private func decodePng(_ data: Data) throws -> RgbaImage {
  guard let source = CGImageSourceCreateWithData(data as CFData, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
  else { throw DemDecodeException("PNG decode failed") }
  let width = image.width
  let height = image.height
  var pixels = [UInt8](repeating: 0, count: width * height * 4)
  // パレットPNGの色空間（indexed）はビットマップコンテキストに使えないので、そのbaseを使う
  let imageSpace = image.colorSpace
  let space = (imageSpace?.model == .indexed ? imageSpace?.baseColorSpace : imageSpace)
    ?? CGColorSpace(name: CGColorSpace.sRGB)!
  let drawn = pixels.withUnsafeMutableBytes { dst -> Bool in
    guard let ctx = CGContext(
      data: dst.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return false }
    ctx.interpolationQuality = .none
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return true
  }
  guard drawn else { throw DemDecodeException("PNG draw failed") }
  return RgbaImage(width: width, height: height, pixels: pixels)
}

private final class DemDecodeException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}
