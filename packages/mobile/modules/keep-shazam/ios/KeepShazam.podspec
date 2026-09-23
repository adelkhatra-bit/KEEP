Pod::Spec.new do |s|
  s.name           = 'KeepShazam'
  s.version        = '1.0.0'
  s.summary        = 'Native ShazamKit recognition for KEEP'
  s.description    = 'Local Expo module that matches KEEP microphone samples against the Shazam catalog.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'KEEP' => 'adel.khatra@live.fr' }
  s.homepage       = 'https://github.com/adelkhatra-bit/KEEP'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/adelkhatra-bit/KEEP.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'ShazamKit'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
