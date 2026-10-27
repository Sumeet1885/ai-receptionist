/**
 * Issue a new temporary password for a admin account, unlock it and sign out all its sessions.
 *
 *   pnpm --filter @ai-receptionist/api admin:reset-password --email ops@example.com --confirm-project <ref>
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { generateTemporaryPassword, hashPassword } from '../src/modules/admin-auth/password';
import {
  findAdminUserByEmail,
  recordAudit,
  revokeOtherSessions,
  setPassword,
} from '../src/modules/admin-auth/repository';
import { requireConfirmedProject } from './admin-cli';

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

  const adminUser = await findAdminUserByEmail(email);
  if (!adminUser) {
    console.error(`No admin account for ${email}.`);
    process.exit(1);
  }

  const password = generateTemporaryPassword();
  await setPassword(adminUser.id, await hashPassword(password), true);
  await revokeOtherSessions(adminUser.id, null);
  await recordAudit({
    action: 'admin.reset_password',
    decision: 'allowed',
    outcome: 'succeeded',
    resource_type: 'admin_user',
    resource_id: adminUser.id,
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
