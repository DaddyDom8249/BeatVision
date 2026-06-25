import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import TextToImagePage from '@/pages/TextToImagePage';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreateProjectPage = lazy(() => import('./pages/CreateProjectPage'));
const ProjectResultsPage = lazy(() => import('./pages/ProjectResultsPage'));
const ProviderSettingsPage = lazy(() => import('./pages/ProviderSettingsPage'));

function Wrap({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-background"><div className="text-muted-foreground text-sm">Loading...</div></div>}>{children}</Suspense>;
}

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'Landing', path: '/', element: <Wrap><LandingPage /></Wrap>, public: true },
  { name: 'Auth', path: '/auth', element: <Wrap><AuthPage /></Wrap>, public: true },
  { name: 'Dashboard', path: '/dashboard', element: <Wrap><DashboardPage /></Wrap> },
  { name: 'Create Project', path: '/create', element: <Wrap><CreateProjectPage /></Wrap> },
  { name: 'Project Results', path: '/project/:id', element: <Wrap><ProjectResultsPage /></Wrap> },
  { name: 'Provider Settings', path: '/settings/providers', element: <Wrap><ProviderSettingsPage /></Wrap>, public: true },
  { name: 'Text to Image', path: '/text-to-image', element: <Wrap><TextToImagePage /></Wrap>, public: true },
];
