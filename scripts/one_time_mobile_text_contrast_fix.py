from pathlib import Path
import re

ROOT = Path('packages/mobile/src')
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx'}
COLOR_RE = re.compile(r"\bcolor\s*:\s*(['\"])(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\1")


def rgb(hex_value: str):
    h = hex_value[1:]
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return [int(h[i:i+2], 16) for i in (0, 2, 4)]


def saturation(channels):
    r, g, b = [value / 255 for value in channels]
    maximum = max(r, g, b)
    minimum = min(r, g, b)
    if maximum == minimum:
        return 0
    lightness = (maximum + minimum) / 2
    return (maximum - minimum) / (1 - abs(2 * lightness - 1))


def is_gray_text(hex_value: str):
    channels = rgb(hex_value)
    average = sum(channels) / 3
    sat = saturation(channels)
    return average >= 64 and average < 245 and sat <= 0.25


changed_files = []
changed_colors = 0
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.suffix not in EXTENSIONS:
        continue
    # Protected navigation shell: never edit it automatically.
    if path.name == 'Navigation.tsx':
        continue
    source = path.read_text(encoding='utf-8')

    def replace(match):
        global changed_colors
        value = match.group(2)
        if not is_gray_text(value):
            return match.group(0)
        changed_colors += 1
        return "color:'#FFFFFF'"

    updated = COLOR_RE.sub(replace, source)
    if updated != source:
        path.write_text(updated, encoding='utf-8')
        changed_files.append(str(path))

if not changed_files:
    raise SystemExit('No gray text colors were found; refusing a no-op cleanup.')

print(f'Updated {changed_colors} gray text color declarations across {len(changed_files)} files.')
for file in changed_files:
    print(file)
