import { useEffect, useRef, type ReactNode } from 'react';

interface LandingDialogProps {
  id: string;
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}

/** Native modal dialog: focus trapping, Escape and the top layer come from the browser. Backdrop click closes. */
export function LandingDialog({ id, open, onClose, closeLabel, children }: LandingDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      dialog.querySelectorAll('video').forEach((video) => video.pause());
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <button className="close" type="button" aria-label={closeLabel} onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}
