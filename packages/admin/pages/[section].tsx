import type { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import AdminLayout from '../components/AdminLayout';
import { currentTab, NAV_GROUPS } from '../lib/adminNavigation';
import Home from './index';
import Launch from './launch-center';
import Operations from './operations';
import Users from './users';
import Team from './team';
import Music from './music';
import Brain from './music-brain';
import Marketplace from './marketplace';
import Community from './community';
import Messages from './messages';
import Moderation from './moderation';
import Reports from './problem-reports';
import Support from './support-center';
import Plans from './plans';
import Costs from './costs';
import Config from './remote-config';
import Flags from './feature-flags';
import Integrations from './integrations';
import Email from './email-test';
import Notifications from './notification-access';

const PAGES: Record<string, React.ComponentType> = {
  '/': Home, '/launch-center': Launch, '/operations': Operations,
  '/users': Users, '/team': Team, '/music': Music, '/music-brain': Brain,
  '/marketplace': Marketplace, '/community': Community, '/messages': Messages,
  '/moderation': Moderation, '/problem-reports': Reports, '/support-center': Support,
  '/plans': Plans, '/costs': Costs, '/remote-config': Config, '/feature-flags': Flags,
  '/integrations': Integrations, '/email-test': Email, '/notification-access': Notifications,
};

export default function Section({ section }: { section: string }) {
  const router = useRouter();
  if (router.query.tab === undefined) return <AdminLayout><div className="card">…</div></AdminLayout>;
  const item = currentTab('/[section]', section, router.query.tab);
  const Page = item && PAGES[item.href];
  return Page ? <Page key={item.href} /> : (
    <AdminLayout><div className="card" role="alert">Onglet introuvable.</div></AdminLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: NAV_GROUPS.map(({ slug }) => ({ params: { section: slug } })),
  fallback: false,
});
export const getStaticProps: GetStaticProps = async ({ params }) => ({
  props: { section: params?.section },
});
