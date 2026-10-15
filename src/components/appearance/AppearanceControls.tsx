import { useId } from 'react';
import { useAppearance } from '../../theme/ThemeProvider';

const themes = [
  { id: 'classic', name: 'Classic', description: 'Original BeatVision experience.' },
  { id: 'arcane', name: 'Arcane Cinema', description: 'Immersive cinematic studio.' },
] as const;

export default function AppearanceControls() {
  const { preference, reducedMotion, saving, account, synced, storageError, syncError, setTheme, setMotion, retrySync } = useAppearance();
  const group = useId();
  return <div className="appearance-controls">
    <fieldset className="appearance-fieldset">
      <legend>Theme</legend>
      <div className="appearance-options">
        {themes.map(theme => <label className={`appearance-option preview-${theme.id}`} key={theme.id}>
          <input type="radio" name={group} value={theme.id} checked={preference.theme === theme.id} onChange={() => setTheme(theme.id)} />
          <div className="appearance-miniature" aria-hidden="true">
            <span className="miniature-brand">BeatVision</span>
            <div className="miniature-scenes"><span /><span /><span /></div>
            <span className="miniature-timeline" />
          </div>
          <span className="appearance-option-title">{theme.name}</span>
          <span className="appearance-option-description">{theme.description}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="appearance-motion">
      <label><input type="checkbox" checked={reducedMotion} onChange={event => setMotion(event.target.checked ? 'reduce' : 'full')} />Reduced motion</label>
      <div><span className="appearance-motion-state">{preference.motion === 'system' ? 'Following system' : 'Custom'}</span>
        <button type="button" className="secondary-button" disabled={preference.motion === 'system'} onClick={() => setMotion('system')}>Use system</button>
      </div>
    </div>
    <p className="appearance-save-state" role="status" aria-live="polite">
      {saving ? 'Saving appearance...' : account && synced ? 'Saved to your account.' : 'Device preference active.'}
    </p>
    {storageError && <p className="form-error" role="alert">{storageError}</p>}
    {syncError && <div className="appearance-sync-error"><p className="form-error" role="alert">{syncError}</p>
      {account && <button type="button" className="secondary-button" onClick={retrySync} disabled={saving}>Retry account save</button>}
    </div>}
  </div>;
}
