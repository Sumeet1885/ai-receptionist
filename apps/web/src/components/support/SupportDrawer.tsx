import { useEffect, useRef, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { openSupport, SUPPORT_DRAWER_EVENT, type SupportDrawerRequest } from '../../lib/supportDrawer';
import { SupportView } from './SupportView';
import './support-drawer.css';

export function SupportDrawer({
  signedIn,
  navigate,
}: {
  signedIn: boolean;
  navigate: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<(SupportDrawerRequest & { key: number }) | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = (event: Event) => {
      setRequest({ view: 'new', ...(event as CustomEvent<SupportDrawerRequest>).detail, key: Date.now() });
      setOpen(true);
    };
    window.addEventListener(SUPPORT_DRAWER_EVENT, show);
    return () => window.removeEventListener(SUPPORT_DRAWER_EVENT, show);
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);
  const close = () => setOpen(false);
  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => openSupport({ view: 'new' })}
          className="fixed bottom-4 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary-hover sm:bottom-5 sm:right-5"
          aria-label="Open support drawer"
        >
          <LifeBuoy size={19} /> Support
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="support-drawer-title"
        className="support-drawer"
        onClose={close}
        onCancel={close}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-background px-5 py-4">
            <div>
              <h2
                id="support-drawer-title"
                className="flex items-center gap-2 font-display text-lg font-semibold"
              >
                <LifeBuoy size={20} className="text-primary" />{' '}
                {request?.view === 'tickets'
                  ? 'Your support tickets'
                  : request?.view === 'guest-ticket'
                    ? 'Support conversation'
                    : request?.intent === 'sales'
                      ? 'Talk to sales'
                      : 'Contact support'}
              </h2>
              <p className="mt-1 text-sm text-text-subtle">
                {request?.view === 'new'
                  ? request?.intent === 'sales'
                    ? 'Tell us about your business. Our sales team will get in touch.'
                    : 'Send a request to the Bolega India team.'
                  : 'Follow your requests and reply to our team.'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close support drawer"
              onClick={close}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface"
            >
              <X size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {request && (
              <SupportView
                key={request.key}
                embedded
                intent={request.intent || 'support'}
                initialCreate={request.view === 'new'}
                initialTicketId={request.ticketId || ''}
                guestToken={request.token || ''}
                mode={request.view === 'guest-ticket' ? 'guest-ticket' : signedIn ? 'customer' : 'guest'}
                onDone={close}
                navigate={(path) => {
                  close();
                  navigate(path);
                }}
              />
            )}
          </div>
        </div>
      </dialog>
    </>,
    document.body,
  );
}
