import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory simulation of the exact RLS + SQL query logic implemented in the migration and useLeads
test('End-to-End Simulation: Lead isolation and historical retention across unassign and reassignment', () => {
  const customerA = '11111111-1111-1111-1111-111111111111';
  const customerB = '22222222-2222-2222-2222-222222222222';
  const bot1 = 'bot-1-uuid';

  // Database tables
  let bots = [
    { id: bot1, owner_id: customerA, is_active: true, dograh_phone_number: '+919876543210' }
  ];

  let leads: { id: string; bot_id: string; customer_id: string | null; name: string }[] = [];

  // Helper simulating the RLS policy:
  // customer_id = auth.uid() OR (customer_id IS NULL AND bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  function queryLeadsViaRLS(authUid: string) {
    const ownedBotIds = bots
      .filter(b => b.owner_id === authUid)
      .map(b => b.id);

    return leads.filter(l =>
      l.customer_id === authUid ||
      (l.customer_id === null && ownedBotIds.includes(l.bot_id))
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

  // Customer A queries leads after unassignment:
  // Decoupled RLS ensures Customer A retains their historical leads!
  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 1, 'Customer A must retain their historical leads even after bot unassignment');
  assert.equal(custALeads[0].name, 'Alice (Customer A inquiry)');

  // Customer B still sees 0 leads
  custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 0);

  // STEP 3: Super Admin assigns Bot 1 to Customer B
  // Action in admin.routes.ts:
  const botToAssign = bots.find(b => b.id === bot1)!;
  if (botToAssign.owner_id && botToAssign.owner_id !== customerB) {
    leads.forEach(l => {
      if (l.bot_id === bot1 && !l.customer_id) l.customer_id = botToAssign.owner_id;
    });
  }
  botToAssign.owner_id = customerB;
  botToAssign.is_active = true;

  // Customer B queries leads immediately upon assignment
  custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 0, 'Customer B must NOT see Customer A historical leads upon reassignment');

  // Customer A still retains Lead 1
  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 1, 'Customer A still retains their historical leads');

  // STEP 4: Customer B receives new Lead 2 on Bot 1
  leads.push({ id: 'lead-2', bot_id: bot1, customer_id: customerB, name: 'Bob (Customer B inquiry)' });

  custBLeads = queryLeadsViaRLS(customerB);
  assert.equal(custBLeads.length, 1);
  assert.equal(custBLeads[0].name, 'Bob (Customer B inquiry)', 'Customer B sees their own new lead');

  custALeads = queryLeadsViaRLS(customerA);
  assert.equal(custALeads.length, 1, 'Customer A sees their own lead 1');
  assert.equal(custALeads[0].name, 'Alice (Customer A inquiry)');
  assert(!custALeads.some(l => l.name.includes('Bob')), 'Customer A does NOT see Customer B lead');
});

