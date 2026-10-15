import StudioHeader from '../components/navigation/StudioHeader';
import AppearanceControls from '../components/appearance/AppearanceControls';

export default function AppearancePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <div className="app-shell">
    <StudioHeader onNavigate={onNavigate} />
    <main className="dashboard appearance-page">
      <header className="appearance-page-header"><div><span className="eyebrow">PROFILE / SETTINGS</span><h1>Appearance</h1></div>
        <button type="button" className="secondary-button" onClick={() => window.history.length > 1 ? window.history.back() : onNavigate('/')}>Back</button>
      </header>
      <AppearanceControls />
    </main>
  </div>;
}
