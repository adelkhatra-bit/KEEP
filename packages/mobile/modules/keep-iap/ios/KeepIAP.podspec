Pod::Spec.new do |s|
  s.name           = 'KeepIAP'
  s.version        = '1.0.0'
  s.summary        = 'Native StoreKit 2 bridge for KEEP subscriptions'
  s.description    = 'Local Expo module for StoreKit 2 products, purchases, current entitlements and restore purchases.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'KEEP' => 'adel.khatra@live.fr' }
  s.homepage       = 'https://github.com/adelkhatra-bit/KEEP'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/adelkhatra-bit/KEEP.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
