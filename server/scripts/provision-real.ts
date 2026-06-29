import 'dotenv/config';
import { mergeWidgetConfig } from '../src/utils/widgetConfig';
import { buildDograhOutboundInstruction, buildDograhPhoneInstruction, withoutAutoKnownPhoneField } from '../src/modules/phone-calls/receptionistInstruction';
import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition } from '../src/modules/phone-calls/workflowDefinition';
import { updateWorkflowInPlace, publishWorkflow } from '../src/modules/phone-calls/dograhClient';
import { supabase } from '../src/services/db';

const botId = '4d7aac5d-b7cb-4ca4-9892-b2d4a72ee71d';

async function main() {
  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, business_name, industry, knowledge_base, widget_config, primary_color, dograh_workflow_id, dograh_outbound_workflow_id')
    .eq('id', botId)
    .single();
  if (error || !bot) throw error || new Error('bot not found');

  const widgetConfig = mergeWidgetConfig((bot as any).widget_config, bot);
  const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));

  const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata' });
  const inboundDefinition = buildSingleNodeWorkflowDefinition({ personaPrompt: inboundInstruction, extractionVariables, isOutbound: false, businessName: bot.business_name });
  await updateWorkflowInPlace(bot.dograh_workflow_id!, inboundDefinition);
  await publishWorkflow(bot.dograh_workflow_id!);
  console.log('inbound workflow updated + published:', bot.dograh_workflow_id);

  const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata' });
  const outboundDefinition = buildSingleNodeWorkflowDefinition({ personaPrompt: outboundInstruction, extractionVariables, isOutbound: true, businessName: bot.business_name });
  await updateWorkflowInPlace(bot.dograh_outbound_workflow_id!, outboundDefinition);
  await publishWorkflow(bot.dograh_outbound_workflow_id!);
  console.log('outbound workflow updated + published:', bot.dograh_outbound_workflow_id);
}

main().then(() => process.exit(0)).catch(err => { console.error('FAILED:', err); process.exit(1); });
