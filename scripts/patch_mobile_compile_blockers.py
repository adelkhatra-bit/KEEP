from pathlib import Path

p = Path('packages/mobile/src/screens/DiscoverScreen.tsx')
s = p.read_text()
s = s.replace("import { getDiscoveryAccess, loadDiscoveryEntitlement, DiscoveryAccess } from '../services/growthAccessService';", "import { getDiscoveryAccess, DiscoveryAccess } from '../services/growthAccessService';\nimport { loadCurrentPlanCode } from '../services/planService';", 1)
s = s.replace("const entitlement = await loadDiscoveryEntitlement();\n        if (live) setPlanCode(entitlement.planCode || 'FREE');", "const code = await loadCurrentPlanCode(user.id);\n        if (live) setPlanCode(code || 'FREE');", 1)
p.write_text(s)

p = Path('packages/mobile/src/components/ProfileCounterRow.tsx')
s = p.read_text()
old = """type Props = {\n  items: ProfileCounterItem[];\n  kind?: 'connections' | 'keeps';\n  style?: ViewStyle;\n};"""
new = """type Props = {\n  items: ProfileCounterItem[];\n  kind?: 'connections' | 'keeps';\n  compact?: boolean;\n  style?: ViewStyle;\n};"""
if old in s:
    s = s.replace(old, new, 1)
# compact is intentionally accepted as a layout contract without changing the
# established visual design of the shared counter component.
s = s.replace("export default function ProfileCounterRow({ items, kind = 'keeps', style }: Props)", "export default function ProfileCounterRow({ items, kind = 'keeps', style }: Props)", 1)
p.write_text(s)
