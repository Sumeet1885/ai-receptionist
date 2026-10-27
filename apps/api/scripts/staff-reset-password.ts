/**
 * Issue a new temporary password for a staff account, unlock it and sign out all its sessions.
 *
 *   npm run staff:reset-password -w apps/api -- --email ops@example.com --confirm-project <ref>
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { generateTemporaryPassword, hashPassword } from '../src/modules/staff-auth/password';
import {
  findPrincipalByEmail,
  recordAudit,
  revokeOtherSessions,
  setPassword,
} from '../src/modules/staff-auth/repository';
import { requireConfirmedProject } from './staff-cli';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'confirm-project': { type: 'string' },
    },
  });

  const email = values.email?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: --email <email> --confirm-project <ref>');
    process.exit(1);
  }
  requireConfirmedProject(values['confirm-project']);

  const principal = await findPrincipalByEmail(email);
  if (!principal) {
    console.error(`No staff account for ${email}.`);
    process.exit(1);
  }

  const password = generateTemporaryPassword();
  await setPassword(principal.id, await hashPassword(password), true);
  await revokeOtherSessions(principal.id, null);
  await recordAudit({
    action: 'staff.reset_password',
    decision: 'allowed',
    outcome: 'succeeded',
    resource_type: 'staff_principal',
    resource_id: principal.id,
    metadata: { via: 'cli' },
  });

  console.log(`Password reset for ${email}; all sessions signed out.`);
  console.log(`Temporary password (shown once): ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
