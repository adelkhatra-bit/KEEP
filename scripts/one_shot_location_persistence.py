from pathlib import Path

p = Path('packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx')
text = p.read_text(encoding='utf-8')

def once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text = text.replace(old, new, 1)

once(
    "  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');\n",
    "  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');\n  const [locationOptIn, setLocationOptIn] = useState(user?.locationOptIn ?? false);\n",
    'location state',
)
once(
    "      website: website.trim() || undefined,\n      privateInfo:",
    "      website: website.trim() || undefined,\n      locationOptIn,\n      privateInfo:",
    'location build user',
)
once(
    "      applyPlace(places[0]);\n      if (supabase && hasRealAccount) {",
    "      applyPlace(places[0]);\n      setLocationOptIn(true);\n      if (supabase && hasRealAccount) {",
    'location opt in after GPS',
)
p.write_text(text, encoding='utf-8')
print('GPS persistence repair applied')
