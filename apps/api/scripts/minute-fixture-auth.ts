import type pg from 'pg';

/** SQL billing fixtures need the same Auth namespace and email identity as normal users. */
export async function repairMinuteFixtureAuth(db: pg.Client, userId: string) {
  const result = await db.query(`UPDATE auth.users SET
    instance_id=COALESCE(instance_id,'00000000-0000-0000-0000-000000000000'::uuid),
    aud=COALESCE(aud,'authenticated'), role=COALESCE(role,'authenticated'),
    encrypted_password=COALESCE(encrypted_password,''),
    created_at=COALESCE(created_at,now()), updated_at=COALESCE(updated_at,now()),
    confirmation_token=COALESCE(confirmation_token,''), recovery_token=COALESCE(recovery_token,''),
    email_change_token_new=COALESCE(email_change_token_new,''), email_change=COALESCE(email_change,''),
    raw_app_meta_data=COALESCE(raw_app_meta_data,'{}'::jsonb)||'{"provider":"email","providers":["email"]}'::jsonb
    WHERE id=$1 AND raw_user_meta_data->>'fixture_tag'='minute-history-demo-v1'
      AND raw_user_meta_data->>'is_dummy'='true' RETURNING id`, [userId]);
  if (result.rowCount !== 1) throw new Error('Refusing to repair an untagged account.');
  await db.query(`INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
    SELECT u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true,'phone_verified',false),'email',now(),now()
    FROM auth.users u WHERE u.id=$1 AND NOT EXISTS
      (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email')`, [userId]);
}
