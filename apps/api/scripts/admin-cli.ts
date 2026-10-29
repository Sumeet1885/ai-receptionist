// Shared guard for the admin:* account scripts: they write straight to the database, so the
// operator must name the Supabase project they mean to change.
import { config } from '../src/config';

export function projectRef() {
  return new URL(config.supabaseUrl).hostname.split('.')[0];
}

export function requireConfirmedProject(confirmed: string | undefined) {
  const ref = projectRef();
  if (confirmed !== ref) {
    console.error(`This writes to Supabase project "${ref}". Re-run with --confirm-project ${ref} to proceed.`);
    process.exit(1);
  }
}
