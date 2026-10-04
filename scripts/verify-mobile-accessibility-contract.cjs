const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contractPath = path.join(root, 'config', 'mobile-accessibility-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

function fail(message) {
  console.error('[mobile-accessibility-contract] ' + message);
  process.exitCode = 1;
}

if (contract.touchTargets?.sharedMinimum !== 48) fail('sharedMinimum must stay 48');
if (contract.touchTargets?.appleMinimum < 44) fail('Apple minimum must stay >= 44');
if (contract.touchTargets?.androidMinimum < 48) fail('Android minimum must stay >= 48');
if (contract.typography?.mobileBodyTarget < 17) fail('mobileBodyTarget must stay >= 17');
if (contract.typography?.minimumUsefulText < 11) fail('minimumUsefulText must stay >= 11');
if (contract.typography?.dynamicTypeTargetPercent < 200) fail('Dynamic Type target must stay >= 200%');

const files = [
  path.join(root, 'packages', 'mobile', 'src', 'screens', 'HomeScreenCompact.tsx'),
  path.join(root, 'packages', 'mobile', 'src', 'components', 'KeepBattleMobileGameV3.tsx'),
  path.join(root, 'packages', 'mobile', 'src', 'components', 'SwipeDeck.tsx'),
];

for (const file of files) {
  if (!fs.existsSync(file)) fail('missing protected interactive surface: ' + path.relative(root, file));
}

console.log('KEEP mobile accessibility contract OK:', {
  touch: contract.touchTargets.sharedMinimum,
  body: contract.typography.mobileBodyTarget,
  minUsefulText: contract.typography.minimumUsefulText,
  dynamicType: contract.typography.dynamicTypeTargetPercent,
});
