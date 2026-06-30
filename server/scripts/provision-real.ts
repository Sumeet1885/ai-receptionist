import 'dotenv/config';
import { mergeWidgetConfig } from '../src/utils/widgetConfig';
import { buildDograhOutboundInstruction, buildDograhPhoneInstruction, withoutAutoKnownPhoneField } from '../src/modules/phone-calls/receptionistInstruction';
import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, MAX_CALL_DURATION_SECONDS } from '../src/modules/phone-calls/workflowDefinition';
import { createHttpTool, updateHttpTool, updateWorkflowInPlace, publishWorkflow } from '../src/modules/phone-calls/dograhClient';
import { config } from '../src/config';
import { supabase } from '../src/services/db';

const botId = '4d7aac5d-b7cb-4ca4-9892-b2d4a72ee71d';
const WORKFLOW_CONFIGURATIONS = { max_call_duration: MAX_CALL_DURATION_SECONDS };

async function ensureTool(existingUuid: string | null, params: any): Promise<string> {
  if (existingUuid) {
    await updateHttpTool(existingUuid, params);
    return existingUuid;
  }
  return (await createHttpTool(params)).tool_uuid;
}

async function main() {
  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, owner_id, business_name, industry, knowledge_base, widget_config, dograh_workflow_id, dograh_outbound_workflow_id, dograh_check_availability_tool_uuid, dograh_book_appointment_tool_uuid, dograh_call_time_tool_uuid')
    .eq('id', botId)
    .single();
  if (error || !bot) throw error || new Error('bot not found');

  const widgetConfig = mergeWidgetConfig((bot as any).widget_config, bot);
  const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));

  const apiKeyHeader = { 'X-API-Key': config.phoneTools.apiKey };
  const base = `${config.phoneTools.callbackBaseUrl}/api/phone-tools/${bot.id}`;

  const callTimeToolUuid = await ensureTool(bot.dograh_call_time_tool_uuid, {
    name: `Check Call Time Remaining - ${bot.business_name}`,
    description: 'Check how much time is left on this call before it should wrap up. Call this periodically, more often as the call goes on.',
    url: `${base}/call-time-remaining`,
    method: 'POST' as const,
    headers: apiKeyHeader,
    presetParameters: [{ name: 'session_id', type: 'string' as const, value_template: '{{initial_context.session_id}}' }],
  });

  const checkAvailabilityToolUuid = await ensureTool(bot.dograh_check_availability_tool_uuid, {
    name: `Check Availability - ${bot.business_name}`,
    description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
    url: `${base}/check-availability`,
    method: 'POST' as const,
    headers: apiKeyHeader,
    parameters: [{ name: 'date', type: 'string' as const, description: 'Date in YYYY-MM-DD format', required: true }],
  });

  const bookAppointmentToolUuid = await ensureTool(bot.dograh_book_appointment_tool_uuid, {
    name: `Book Appointment - ${bot.business_name}`,
    description: 'Book an appointment slot. Ensure availability was checked first and the caller has agreed to the specific slot.',
    url: `${base}/book-appointment`,
    method: 'POST' as const,
    headers: apiKeyHeader,
    parameters: [
      { name: 'title', type: 'string' as const, description: 'Title of the appointment', required: true },
      { name: 'visitorName', type: 'string' as const, description: 'Caller full name', required: false },
      { name: 'visitorPhone', type: 'string' as const, description: 'Caller phone number', required: false },
      { name: 'visitorEmail', type: 'string' as const, description: 'Caller email address', required: false },
      { name: 'startTime', type: 'string' as const, description: 'Start time in ISO 8601 format', required: true },
      { name: 'endTime', type: 'string' as const, description: 'End time in ISO 8601 format', required: true },
    ],
    presetParameters: [{ name: 'session_id', type: 'string' as const, value_template: '{{initial_context.session_id}}' }],
  });
  console.log('tools:', { callTimeToolUuid, checkAvailabilityToolUuid, bookAppointmentToolUuid });

  const toolUuids = [callTimeToolUuid, checkAvailabilityToolUuid, bookAppointmentToolUuid];
  const preCallFetchUrl = `${base}/pre-call?key=${config.phoneTools.apiKey}`;

  const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata', useToolBasedBooking: true });
  const inboundDefinition = buildSingleNodeWorkflowDefinition({ personaPrompt: inboundInstruction, extractionVariables, isOutbound: false, businessName: bot.business_name, toolUuids, preCallFetchUrl });
  await updateWorkflowInPlace(bot.dograh_workflow_id!, inboundDefinition, WORKFLOW_CONFIGURATIONS);
  await publishWorkflow(bot.dograh_workflow_id!);
  console.log('inbound workflow updated + published:', bot.dograh_workflow_id);

  const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata', useToolBasedBooking: true });
  const outboundDefinition = buildSingleNodeWorkflowDefinition({ personaPrompt: outboundInstruction, extractionVariables, isOutbound: true, businessName: bot.business_name, toolUuids, preCallFetchUrl });
  await updateWorkflowInPlace(bot.dograh_outbound_workflow_id!, outboundDefinition, WORKFLOW_CONFIGURATIONS);
  await publishWorkflow(bot.dograh_outbound_workflow_id!);
  console.log('outbound workflow updated + published:', bot.dograh_outbound_workflow_id);

  const { error: updateError } = await supabase
    .from('bots')
    .update({
      dograh_check_availability_tool_uuid: checkAvailabilityToolUuid,
      dograh_book_appointment_tool_uuid: bookAppointmentToolUuid,
      dograh_call_time_tool_uuid: callTimeToolUuid,
    })
    .eq('id', botId);
  if (updateError) throw updateError;
  console.log('bot row updated with tool uuids');
}

main().then(() => process.exit(0)).catch(err => { console.error('FAILED:', err); process.exit(1); });
