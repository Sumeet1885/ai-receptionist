import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicBotResponse } from '../src/services/publicBot';

test('public bot projection exposes widget UI fields without private configuration', () => {
  const response = toPublicBotResponse({
    id: 'bot-1',
    owner_id: 'owner-secret',
    business_name: 'Example Business',
    industry: 'Services',
    subdomain: 'example-business',
    greeting: 'Hello',
    primary_color: '#123456',
    languages: ['English'],
    knowledge_base: 'Private operating notes',
    allowed_domains: ['customer.example.com'],
    widget_config: { launcherText: 'Talk to us' },
  });

  assert.deepEqual(response, {
    id: 'bot-1',
    business_name: 'Example Business',
    industry: 'Services',
    subdomain: 'example-business',
    greeting: 'Hello',
    primary_color: '#123456',
    languages: ['English'],
    widget_config: response.widget_config,
  });
  assert.equal('owner_id' in response, false);
  assert.equal('knowledge_base' in response, false);
  assert.equal('allowed_domains' in response, false);
});
