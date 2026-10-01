require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'DemDecoder'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/ecorismap/ecorismap.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # SDWebImageWebPCoder（expo-image-manipulator経由）が既に引き込んでいるlibwebpを使う
  s.dependency 'libwebp'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # 画素ループはDebugの-Ononeだと桁違いに遅く、計測にならないため常に最適化する
    'SWIFT_OPTIMIZATION_LEVEL' => '-O'
  }
end
