const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function usernameDisplayViolations(source, filename = 'surface.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  const prefix = /(?:^|\s|[>«(])@$/u;
  const report = (node) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.push(`${filename}:${line + 1}: utiliser displayUsername, jamais un préfixe @`);
  };
  const visit = (node) => {
    if (ts.isTemplateExpression(node)) {
      if (prefix.test(node.head.text)) report(node);
      for (let i = 0; i < node.templateSpans.length - 1; i += 1) {
        const literal = node.templateSpans[i].literal.text;
        const expression = node.templateSpans[i + 1].expression.getText(file);
        // ${local}@${domain} est une adresse, pas un nom affiché.
        if (prefix.test(literal) && (literal !== '@' || /username|pseudo|displayName/i.test(expression))) report(node);
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
      && ts.isStringLiteralLike(node.left) && prefix.test(node.left.text)) report(node);
    if (ts.isJsxText(node) && prefix.test(node.text.trimEnd())) report(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
}

function verifyUsernameDisplay() {
  const failures = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '__tests__', 'dist', 'dist-web', '.next'].includes(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:tsx?|jsx?)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
        failures.push(...usernameDisplayViolations(fs.readFileSync(full, 'utf8'), path.relative(root, full)));
      }
    }
  };
  for (const directory of ['packages/mobile/src', 'packages/admin/pages', 'packages/admin/components',
    'packages/admin/lib', 'packages/backend/src', 'supabase/functions']) {
    if (fs.existsSync(path.join(root, directory))) walk(path.join(root, directory));
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('Noms affichés sans @ : OK (adresses e-mail préservées)');
}

module.exports = { usernameDisplayViolations, verifyUsernameDisplay };
if (require.main === module) verifyUsernameDisplay();
