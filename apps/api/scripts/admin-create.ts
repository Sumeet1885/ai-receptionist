/**
 * Create a admin (admin console) account. There is no public signup for admin.
 *
 *   pnpm --filter @ai-receptionist/api admin:create --email ops@example.com --name "Ops" --role super_admin \
 *     --confirm-project <supabase-project-ref> [--granted-by admin@example.com]
 *
 * Prints a one-time temporary password; the console forces a change at first sign-in.
 * The first super_admin needs no --granted-by (recorded as the bootstrap seed); every later
 * account must name an existing active super_admin.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { generateTemporaryPassword, hashPassword } from '../src/modules/admin-auth/password';
import { ADMIN_ROLES, type AdminRole } from '../src/modules/admin-auth/session';
import { supabase } from '../src/services/db';
import {
  createAdminUser,
  findAdminUserByEmail,
  getActiveRoles,
  grantRole,
  recordAudit,
} from '../src/modules/admin-auth/repository';
import { requireConfirmedProject } from './admin-cli';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      'granted-by': { type: 'string' },
      'confirm-project': { type: 'string' },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role as AdminRole | undefined;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !role || !ADMIN_ROLES.includes(role)) {
    console.error(`Usage: --email <email> --name <name> --role <${ADMIN_ROLES.join('|')}> --confirm-project <ref> [--granted-by <email>]`);
    process.exit(1);
  }
  requireConfirmedProject(values['confirm-project']);

  if (await findAdminUserByEmail(email)) {
    console.error(`A admin account for ${email} already exists. Use admin:reset-password to issue a new password.`);
    process.exit(1);
  }

  let grantedBy: string | null = null;
  if (values['granted-by']) {
    const granter = await findAdminUserByEmail(values['granted-by'].trim().toLowerCase());
    if (!granter || granter.status !== 'active' || !(await getActiveRoles(granter.id)).includes('super_admin')) {
      console.error('--granted-by must be an active super_admin.');
      process.exit(1);
    }
    grantedBy = granter.id;
  } else {
    const { count, error } = await supabase.from('admin_users').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0 || role !== 'super_admin') {
      console.error('Only the first account (a super_admin) may be created without --granted-by.');
      process.exit(1);
    }
  }

  const password = generateTemporaryPassword();
  const adminUser = await createAdminUser({ email, displayName: name, passwordHash: await hashPassword(password) });
  await grantRole({ adminUserId: adminUser.id, role, grantedBy, reason: grantedBy ? 'admin:create' : 'bootstrap seed' });
  await recordAudit({
    action: 'admin.create',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: grantedBy,
    resource_type: 'admin_user',
    resource_id: adminUser.id,
    metadata: { role, via: 'cli' },
  });

  console.log(`Created ${role} ${email} (${adminUser.id}).`);
  console.log(`Temporary password (shown once): ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
