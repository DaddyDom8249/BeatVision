import type { SupabaseClient, User } from '@supabase/supabase-js';

export type ThemeId = 'classic' | 'arcane';
export type MotionPreference = 'system' | 'reduce' | 'full';
export interface Appearance { theme: ThemeId; motion: MotionPreference }
interface AppearanceBridge {
  key: string;
  read(): Appearance;
  write(value: Appearance): boolean;
  resolve(account: unknown, local: unknown): Appearance;
  apply(value: Appearance): void;
}
declare global { interface Window { BeatVisionAppearance?: AppearanceBridge } }
type Auth = Pick<SupabaseClient['auth'], 'getUser' | 'updateUser' | 'onAuthStateChange'>;
export interface AppearanceState {
  preference: Appearance;
  reducedMotion: boolean;
  saving: boolean;
  account: boolean;
  synced: boolean;
  storageError: string | null;
  syncError: string | null;
}

export class AppearanceStore {
  private bridge: AppearanceBridge;
  private listeners = new Set<() => void>();
  private user: User | null = null;
  private active = false;
  private lifetime = 0;
  private authVersion = 0;
  private choiceVersion = 0;
  private identityKnown = false;
  private pending: { preference: Appearance; owner: string; version: number } | null = null;
  private unacknowledgedChoice: { preference: Appearance; owner: string; version: number } | null = null;
  private writing = false;
  private cleanup: (() => void) | null = null;
  private state: AppearanceState;

  constructor(private auth: Auth, private browser: Window) {
    // A missing optional bootstrap must not prevent the production app mounting.
    this.bridge = browser.BeatVisionAppearance ?? {
      key: 'beatvision.appearance.v1', read: () => ({ theme: 'classic', motion: 'system' }), write: () => false,
      resolve: () => ({ theme: 'classic', motion: 'system' }),
      apply: value => { browser.document.documentElement.dataset.theme = value.theme; browser.document.documentElement.dataset.motion = value.motion === 'reduce' ? 'reduce' : 'full'; },
    };
    const preference = this.bridge.read();
    this.state = { preference, reducedMotion: false, saving: false, account: false, synced: false, storageError: null, syncError: null };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(update: Partial<AppearanceState>) {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  private apply(preference: Appearance) {
    this.bridge.apply(preference);
    const system = this.browser.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.emit({ preference, reducedMotion: preference.motion === 'reduce' || (preference.motion === 'system' && system) });
  }

  start() {
    if (this.active) return;
    this.active = true;
    const lifetime = ++this.lifetime;
    this.apply(this.state.preference);
    const media = this.browser.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => this.apply(this.state.preference);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== this.bridge.key && event.key !== null) return;
      if (this.state.saving) return;
      this.apply(this.bridge.resolve(this.user?.user_metadata?.beatvision_appearance, this.bridge.read()));
    };
    media?.addEventListener('change', onMotion);
    this.browser.addEventListener('storage', onStorage);
    const { data } = this.auth.onAuthStateChange((_event, session) => {
      const version = ++this.authVersion;
      // Do not perform nested Supabase auth calls inside its locked callback.
      queueMicrotask(() => {
        if (this.active && lifetime === this.lifetime && version === this.authVersion) this.acceptUser(session?.user ?? null);
      });
    });
    const authVersion = this.authVersion;
    void this.auth.getUser().then(({ data, error }) => {
      if (!this.active || lifetime !== this.lifetime || authVersion !== this.authVersion) return;
      if (error) {
        this.emit({ syncError: 'Account appearance is unavailable. Device preference remains active.' });
        return;
      }
      this.acceptUser(data.user ?? null);
    }).catch(() => {
      if (this.active && lifetime === this.lifetime && authVersion === this.authVersion) this.emit({ syncError: 'Account appearance is unavailable. Device preference remains active.' });
    });
    this.cleanup = () => {
      media?.removeEventListener('change', onMotion);
      this.browser.removeEventListener('storage', onStorage);
      data.subscription.unsubscribe();
    };
  }

  stop() { this.active = false; this.lifetime++; this.cleanup?.(); this.cleanup = null; this.pending = null; this.unacknowledgedChoice = null; this.emit({ saving: false }); }

  private acceptUser(user: User | null) {
    const changed = this.identityKnown && this.user?.id !== user?.id;
    const recentLocalChoice = !this.identityKnown && this.choiceVersion > 0;
    this.identityKnown = true;
    this.user = user;
    if (changed) { this.choiceVersion++; this.pending = null; this.unacknowledgedChoice = null; this.emit({ saving: false }); }
    // A refreshed same-user session may contain stale account metadata after a
    // failed write. Keep the explicit local choice and its Retry state until
    // the write is acknowledged or the account identity changes.
    if (!changed && user && this.unacknowledgedChoice?.owner === user.id) {
      this.emit({ account: true, synced: false });
      if (!this.state.saving) this.apply(this.unacknowledgedChoice.preference);
      return;
    }
    const resolved = this.bridge.resolve(user?.user_metadata?.beatvision_appearance, this.bridge.read());
    const saved = user?.user_metadata?.beatvision_appearance;
    this.emit({ account: Boolean(user), synced: Boolean(saved && saved.theme === resolved.theme && saved.motion === resolved.motion), syncError: null });
    if (!changed && this.state.saving) return;
    if (recentLocalChoice && user) { this.queueSave(); return; }
    this.apply(resolved);
  }

  setTheme = (theme: ThemeId) => { if (theme === 'classic' || theme === 'arcane') this.choose({ ...this.state.preference, theme }); };
  setMotion = (motion: MotionPreference) => { if (['system', 'reduce', 'full'].includes(motion)) this.choose({ ...this.state.preference, motion }); };
  private choose(preference: Appearance) {
    this.choiceVersion++;
    this.apply(preference);
    const stored = this.bridge.write(preference);
    this.emit({ synced: false, storageError: stored ? null : 'Device storage is unavailable. Appearance is retained for this session.' });
    this.queueSave();
  }
  retrySync = () => { this.queueSave(); };
  private queueSave() {
    if (!this.user || !this.active) return;
    this.pending = { preference: this.state.preference, owner: this.user.id, version: this.choiceVersion };
    this.unacknowledgedChoice = this.pending;
    this.emit({ saving: true, syncError: null });
    if (!this.writing) void this.drain();
  }
  private async drain() {
    this.writing = true;
    const lifetime = this.lifetime;
    try {
      while (this.active && this.pending) {
        const task = this.pending;
        this.pending = null;
        if (this.user?.id !== task.owner) continue;
        try {
          const { data, error } = await this.auth.updateUser({ data: { beatvision_appearance: task.preference } });
          if (!this.active || lifetime !== this.lifetime) return;
          if (this.user?.id !== task.owner || this.choiceVersion !== task.version) continue;
          if (error || data.user?.id !== task.owner) throw error ?? new Error('Account changed');
          const saved = data.user.user_metadata?.beatvision_appearance;
          if (saved?.theme !== task.preference.theme || saved?.motion !== task.preference.motion) throw new Error('Preference was not acknowledged');
          this.user = data.user;
          this.unacknowledgedChoice = null;
          this.emit({ synced: true, syncError: null });
        } catch {
          if (this.active && lifetime === this.lifetime && this.user?.id === task.owner && this.choiceVersion === task.version) {
            this.emit({ synced: false, syncError: 'Account preference could not be saved. The current appearance remains active on this device.' });
          }
        }
      }
    } finally {
      this.writing = false;
      if (this.active && lifetime === this.lifetime) this.emit({ saving: false });
      if (this.active && this.pending) void this.drain();
    }
  }
}
