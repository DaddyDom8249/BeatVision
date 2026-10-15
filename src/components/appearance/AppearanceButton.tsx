import { useEffect, useRef, useState } from 'react';
import AppearanceControls from './AppearanceControls';

export default function AppearanceButton() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); trigger.current?.focus(); };
  }, [open]);
  return <>
    <button type="button" className="appearance-trigger" aria-label="Appearance settings" title="Appearance settings"
      aria-haspopup="dialog" onClick={() => setOpen(true)} ref={trigger}>
      <img src="/icons/settings.svg" alt="" width="18" height="18" />
    </button>
    {open && <dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-dialog-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
          .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
            (!(element instanceof HTMLInputElement) || element.type !== 'radio' || element.checked));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className="appearance-dialog-header">
        <div><span className="eyebrow">SETTINGS</span><h2 id="appearance-dialog-title">Appearance</h2></div>
        <button type="button" className="appearance-close" aria-label="Close appearance settings" title="Close" onClick={() => setOpen(false)}><img src="/icons/x.svg" alt="" width="20" height="20" /></button>
      </header>
      <AppearanceControls />
    </dialog>}
  </>;
}
