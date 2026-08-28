from pathlib import Path

path = Path('.github/workflows/keep-dual-viewport-guardian.yml')
text = path.read_text(encoding='utf-8')
old = """              const context = await browser.newContext({ viewport:{ width:c.width, height:c.height }, deviceScaleFactor:1 });
              const page = await context.newPage();"""
new = """              const context = await browser.newContext({
                viewport:{ width:c.width, height:c.height },
                deviceScaleFactor:1,
                geolocation:{ latitude:45.95, longitude:4.884 },
              });
              await context.grantPermissions(['geolocation'], { origin:'http://127.0.0.1:8081' });
              const page = await context.newPage();"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected alignment context anchor exactly once, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Dual viewport discovery geolocation restored for alignment flow')
