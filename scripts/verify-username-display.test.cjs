const { test } = require('node:test');
const assert = require('node:assert/strict');
const { usernameDisplayViolations } = require('./verify-username-display.cjs');

test('refuse les préfixes de noms dans les templates, JSX et concaténations', () => {
  for (const source of [
    'const label = `@${user.username}`;',
    'const body = `Story de @${name}`;',
    'const label = "@" + user.username;',
    "const label = 'Story de @' + name;",
    "const label = '@' +\n name;",
    'const label = <Text>@{user.username}</Text>;',
    'const label = <Text>Story de @{name}</Text>;',
    'const body = `${count} vues par @${name}`;',
  ]) assert.ok(usernameDisplayViolations(source).length > 0, source);
});

test('préserve les adresses, imports, commentaires et noms normalisés', () => {
  for (const source of [
    'const email = "inside@example.com";',
    'const email = `${local}@${domain}`;',
    'const email = `inside@${domain}`;',
    'const email = local + "@" + domain;',
    'import x from "@keep/music";',
    '// ancien rendu : `@${username}`',
    'const label = `Story de ${displayUsername(name)}`;',
    'const label = <Text>{displayUsername(user.username)}</Text>;',
  ]) assert.deepEqual(usernameDisplayViolations(source), [], source);
});
