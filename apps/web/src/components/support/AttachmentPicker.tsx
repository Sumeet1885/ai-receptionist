import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { SUPPORT_FILE_ACCEPT, supportFileError } from '@ai-receptionist/contracts';
import { Button } from '../ui/button';

export function AttachmentPicker({
  id,
  files,
  onChange,
  onError,
  creating,
  disabled,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  onError: (error: string) => void;
  creating: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const select = (next: File[]) => {
    const issue = supportFileError(next, creating);
    onError(issue);
    if (!issue) onChange(next);
  };
  return (
    <div
      className="min-w-0"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) select(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        aria-label={creating ? 'Support attachment' : 'Reply attachments'}
        accept={SUPPORT_FILE_ACCEPT}
        multiple={!creating}
        disabled={disabled}
        onChange={(event) => {
          select(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <div className="min-h-16 min-w-0 rounded-lg border border-dashed border-border bg-background/50 px-3 py-2.5">
        {files.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => input.current?.click()}
              className="h-9 shrink-0 px-3"
            >
              <Paperclip size={16} /> {creating ? 'Attach file' : 'Attach files'}
            </Button>
            <p className="text-sm leading-5 text-text-subtle">
              JPG, PNG, WEBP or PDF
              <br />
              {creating ? '1 file ? Up to 2 MB' : 'Up to 3 files ? 10 MB each'}
            </p>
          </div>
        ) : (
          <ul className="min-w-0 space-y-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex min-w-0 items-start gap-2 text-sm">
                <button
                  type="button"
                  aria-label="Change attachment"
                  onClick={() => input.current?.click()}
                  disabled={disabled}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface"
                >
                  <Paperclip size={16} />
                </button>
                <div className="min-w-0 flex-1 py-1">
                  <span className="block break-all leading-5">{file.name}</span>
                  <span className="mt-0.5 block text-xs text-text-subtle">
                    {file.size >= 1048576
                      ? `${(file.size / 1048576).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(files.filter((_, i) => i !== index));
                    onError('');
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
