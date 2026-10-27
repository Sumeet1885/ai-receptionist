/**
 * Create a staff (admin console) account. There is no public signup for staff.
 *
 *   pnpm --filter @ai-receptionist/api staff:create --email ops@example.com --name "Ops" --role super_admin \
 *     --confirm-project <supabase-project-ref> [--granted-by admin@example.com]
 *
 * Prints a one-time temporary password; the console forces a change at first sign-in.
 * The first super_admin needs no --granted-by (recorded as the bootstrap seed); every later
 * account must name an existing active super_admin.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { generateTemporaryPassword, hashPassword } from '../src/modules/staff-auth/password';
import { STAFF_ROLES, type StaffRole } from '../src/modules/staff-auth/session';
import { supabase } from '../src/services/db';
import {
  createPrincipal,
  findPrincipalByEmail,
  getActiveRoles,
  grantRole,
  recordAudit,
} from '../src/modules/staff-auth/repository';
import { requireConfirmedProject } from './staff-cli';

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
  const role = values.role as StaffRole | undefined;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !role || !STAFF_ROLES.includes(role)) {
    console.error(`Usage: --email <email> --name <name> --role <${STAFF_ROLES.join('|')}> --confirm-project <ref> [--granted-by <email>]`);
    process.exit(1);
  }
  requireConfirmedProject(values['confirm-project']);

  if (await findPrincipalByEmail(email)) {
    console.error(`A staff account for ${email} already exists. Use staff:reset-password to issue a new password.`);
    process.exit(1);
  }

  let grantedBy: string | null = null;
  if (values['granted-by']) {
    const granter = await findPrincipalByEmail(values['granted-by'].trim().toLowerCase());
    if (!granter || granter.status !== 'active' || !(await getActiveRoles(granter.id)).includes('super_admin')) {
      console.error('--granted-by must be an active super_admin.');
      process.exit(1);
    }
    grantedBy = granter.id;
  } else {
    const { count, error } = await supabase.from('staff_principals').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0 || role !== 'super_admin') {
      console.error('Only the first account (a super_admin) may be created without --granted-by.');
      process.exit(1);
    }
  }

  const password = generateTemporaryPassword();
  const principal = await createPrincipal({ email, displayName: name, passwordHash: await hashPassword(password) });
  await grantRole({ principalId: principal.id, role, grantedBy, reason: grantedBy ? 'staff:create' : 'bootstrap seed' });
  await recordAudit({
    action: 'staff.create',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_principal_id: grantedBy,
    resource_type: 'staff_principal',
    resource_id: principal.id,
    metadata: { role, via: 'cli' },
  });

  console.log(`Created ${role} ${email} (${principal.id}).`);
  console.log(`Temporary password (shown once): ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
