import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers

/**
 写真（HEIC・WebPなど）をJPEGへ変換する。

 expo-image-manipulator は UIImage を経由するため、撮影位置・撮影日時などの EXIF が落ちる。
 ImageIO の CGImageDestinationAddImageFromSource は元画像のメタデータ（EXIF・GPS・TIFF・向き）を
 そのまま引き継いで書き出すので、こちらを使う。画素は回転させず、向きはタグのまま残す。
 */
public class PhotoConverterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotoConverter")

    AsyncFunction("convertToJpeg") { (srcUri: String, dstUri: String, quality: Double) throws in
      let src = fileURL(srcUri)
      let dst = fileURL(dstUri)
      guard let source = CGImageSourceCreateWithURL(src as CFURL, nil), CGImageSourceGetCount(source) > 0 else {
        throw PhotoConvertException("画像を読み込めません: \(srcUri)")
      }
      guard let dest = CGImageDestinationCreateWithURL(dst as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw PhotoConvertException("書き出し先を作れません: \(dstUri)")
      }
      let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
      CGImageDestinationAddImageFromSource(dest, source, 0, options as CFDictionary)
      guard CGImageDestinationFinalize(dest) else {
        throw PhotoConvertException("JPEGへの書き出しに失敗しました: \(dstUri)")
      }
    }
  }

  private func fileURL(_ uri: String) -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) { return url }
    return URL(fileURLWithPath: uri)
  }
}

final class PhotoConvertException: GenericException<String> {
  override var reason: String { param }
}
