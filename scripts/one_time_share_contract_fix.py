from pathlib import Path

p = Path('packages/mobile/share-profile.html')
s = p.read_text(encoding='utf-8')

if "function routeCreate=(" in s:
    s = s.replace("function routeCreate=(", "function followAccountRoute=(", 1)
elif "const routeCreate=(" in s:
    s = s.replace("const routeCreate=(", "const followAccountRoute=(", 1)
elif "function routeCreate(" in s:
    s = s.replace("function routeCreate(", "function followAccountRoute(", 1)
elif "const routeCreate=" in s:
    s = s.replace("const routeCreate=", "const followAccountRoute=", 1)

s = s.replace("routeCreate(p.username)", "followAccountRoute(p.username)")
s = s.replace("routeCreate(username)", "followAccountRoute(username)")
s = s.replace("routeCreate(u)", "followAccountRoute(u)")
s = s.replace("button.textContent='+ SUIVRE';button.onclick=()=>{location.href=followAccountRoute(p.username);};", "button.textContent='CRÉER MON COMPTE POUR SUIVRE';button.onclick=()=>{location.href=followAccountRoute(p.username);};", 1)

if 'followAccountRoute' not in s:
    raise SystemExit('PATCH FAILED: followAccountRoute marker')
if 'CRÉER MON COMPTE' not in s:
    raise SystemExit('PATCH FAILED: create account marker')

p.write_text(s, encoding='utf-8')
print('SHARE_CONTRACT_OK')
