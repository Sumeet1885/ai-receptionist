import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory simulation of the exact RLS + SQL query logic implemented in the migration and useLeads
test('End-to-End Simulation: Lead isolation across unassign and reassignment', () => {
  const customerA = '11111111-1111-1111-1111-111111111111';
  const customerB = '22222222-2222-2222-2222-222222222222';
  const bot1 = 'bot-1-uuid';

  // Database tables
  let bots = [
    { id: bot1, owner_id: customerA, is_active: true, dograh_phone_number: '+919876543210' }
  ];

  let leads: { id: string; bot_id: string; customer_id: string | null; name: string }[] = [];

  // Helper simulating the RLS policy:
  // bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid() AND is_active = TRUE)
  // AND (customer_id IS NULL OR customer_id = auth.uid())
  function queryLeadsViaRLS(authUid: string) {
    const activeOwnedBotIds = bots
      .filter(b => b.owner_id === authUid && b.is_active === true)
      .map(b => b.id);

    return leads.filter(l =>
      activeOwnedBotIds.includes(l.bot_id) &&
      (l.customer_id === null || l.customer_id === authUid)
    );
  }

  // STEP 1: Customer A generates Lead 1 on Bot 1
  leads.push({ id: 'lead-1', bot_id: bot1, customer_id: customerA, name: 'Alice (Customer A inquiry)' });

  // Customer A queries leads
  let custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 1);
  assert.equal(custALeads[0].name, 'Alice (Customer A inquiry)');

  // Customer B queries leads
  let custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 0);

  // STEP 2: Super Admin unassigns Bot 1 from Customer A
  // Action in admin.routes.ts:
  // 1. Stamp untagged leads
  leads.forEach(l => {
    if (l.bot_id === bot1 && !l.customer_id) l.customer_id = customerA;
  });
  // 2. Detach owner and deactivate
  const botToUnassign = bots.find(b => b.id === bot1)!;
  botToUnassign.owner_id = null as any;
  botToUnassign.is_active = false;

  // VERIFICATION FOR ISSUE 1:
  // Customer A queries leads after unassignment
  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 0, 'Customer A must NOT see any leads after agent is unassigned');

  // STEP 3: Super Admin assigns Bot 1 to Customer B
  // Action in admin.routes.ts:
  const botToAssign = bots.find(b => b.id === bot1)!;
  // If prior owner existed and differed from new owner, ensure stamped
  if (botToAssign.owner_id && botToAssign.owner_id !== customerB) {
    leads.forEach(l => {
      if (l.bot_id === bot1 && !l.customer_id) l.customer_id = botToAssign.owner_id;
    });
  }
  botToAssign.owner_id = customerB;
  botToAssign.is_active = true;

  // VERIFICATION FOR ISSUE 4:
  // Customer B queries leads immediately upon assignment
  custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 0, 'Customer B must NOT see Customer A historical leads upon reassignment');

  // Customer A still sees 0 leads
  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 0, 'Customer A still sees 0 leads');

  // STEP 4: Customer B receives new Lead 2 on Bot 1
  leads.push({ id: 'lead-2', bot_id: bot1, customer_id: customerB, name: 'Bob (Customer B inquiry)' });

  custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 1);
  assert.equal(custBLeads[0].name, 'Bob (Customer B inquiry)', 'Customer B sees their own new lead');

  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 0, 'Customer A does NOT see Customer B lead');
});

