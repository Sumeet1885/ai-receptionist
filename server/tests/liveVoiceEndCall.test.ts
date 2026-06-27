import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateContactInput } from '../src/utils/contactValidation';
import { buildBusinessPersona, buildWebVoiceExtraConstraints } from '../src/modules/phone-calls/receptionistInstruction';
import { defaultWidgetConfig } from '../src/utils/widgetConfig';

const sampleBot = { business_name: 'Test Biz', industry: 'Test', knowledge_base: 'KB' };

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const helperPath = path.join(workspaceRoot, 'server', 'src', 'services', 'liveTools.ts');
const liveControllerPath = path.join(workspaceRoot, 'server', 'src', 'controllers', 'liveChatController.ts');
const publicVoiceHookPath = path.join(workspaceRoot, 'client', 'src', 'hooks', 'useLiveVoice.ts');
const widgetControllerPath = path.join(workspaceRoot, 'server', 'src', 'controllers', 'widgetController.ts');
const voiceCallViewPath = path.join(workspaceRoot, 'client', 'src', 'components', 'chat', 'VoiceCallView.tsx');
const clientContactValidationPath = path.join(workspaceRoot, 'client', 'src', 'lib', 'contactValidation.ts');
const geminiGuardPath = path.join(workspaceRoot, 'server', 'src', 'services', 'geminiGuard.ts');

test('live Gemini tool declarations include assistant-controlled call ending with explicit confirmation guidance', async () => {
  assert.equal(
    existsSync(helperPath),
    true,
    'expected server/src/services/liveTools.ts to exist so the live tool contract can be tested directly'
  );

  const helper = await import(pathToFileURL(helperPath).href);
  const tools = helper.buildLiveFunctionDeclarations(['title', 'visitorName', 'startTime', 'endTime']);
  const endCallTool = tools.find((tool: any) => tool.name === 'end_call');

  assert.ok(endCallTool, 'expected end_call tool declaration to be present');
  assert.match(helper.LIVE_END_CALL_INSTRUCTION, /confirmed the conversation is over/i);
  assert.match(helper.LIVE_END_CALL_INSTRUCTION, /said goodbye/i);
});

test('shared live voice backend and both clients honor assistant-triggered call ending', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');
  const publicVoiceHookSource = readFileSync(publicVoiceHookPath, 'utf8');
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');

  assert.match(liveControllerSource, /type:\s*'end_call'/);
  assert.match(liveControllerSource, /name === 'end_call'/);
  assert.match(publicVoiceHookSource, /msg\.type === 'end_call'/);
  assert.match(widgetSource, /msg\.type === 'end_call'/);
});

test('gemini 3.1 live setup avoids forcing speech_config on the websocket setup payload', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');

  assert.match(liveControllerSource, /model:\s*'models\/gemini-3\.1-flash-live-preview'/);
  assert.doesNotMatch(
    liveControllerSource,
    /speech_config\s*:/,
    'gemini 3.1 live currently closes the websocket with 1011 when speech_config is forced into setup'
  );
});

test('contact validation accepts plausible values and rejects junk', () => {
  assert.equal(validateContactInput('email', 'Person@Example.com').valid, true);
  assert.equal(validateContactInput('email', 'not-an-email').valid, false);
  assert.equal(validateContactInput('email', 'name@example..com').valid, false);
  assert.equal(validateContactInput('email', '.name@example.com').valid, false);
  assert.equal(validateContactInput('email', 'name@-example.com').valid, false);
  assert.deepEqual(validateContactInput('phone', '9415072638'), {
    valid: true,
    normalized: '9415072638',
    error: '',
  });
  assert.equal(validateContactInput('phone', 'abc1234567').valid, false);
  assert.equal(validateContactInput('phone', '1234').valid, false);
  assert.equal(validateContactInput('phone', '1234567890').valid, false);
  assert.equal(validateContactInput('phone', '0123456789').valid, false);
  assert.equal(validateContactInput('phone', '1111111111').valid, false);
  assert.equal(validateContactInput('phone', '8888888888').valid, false);
  assert.equal(validateContactInput('phone', '9876543210').valid, false);
  assert.equal(validateContactInput('phone', '1212121212').valid, false);
  assert.equal(validateContactInput('phone', '987654321').valid, false);
  assert.equal(validateContactInput('phone', '98765432100').valid, false);
  assert.equal(validateContactInput('phone', '98765 43210').valid, false);
  assert.equal(validateContactInput('phone', '+919415072638').valid, true);
  assert.equal(
    validateContactInput('phone', '+9194150726389').valid,
    false,
    'a generic 7-15 digit E.164 regex must not accept an invalid country-specific length'
  );
});

test('preview phone validation matches the country-aware backend contract', async () => {
  const clientValidation = await import(pathToFileURL(clientContactValidationPath).href);

  assert.equal(clientValidation.validateContactInput('phone', '+919415072638').valid, true);
  assert.equal(clientValidation.validateContactInput('phone', '+9194150726389').valid, false);
  assert.equal(clientValidation.validateContactInput('phone', '+918888888888').valid, false);
});

test('live voice flow validates typed contact details in backend and both clients', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');
  const publicVoiceHookSource = readFileSync(publicVoiceHookPath, 'utf8');
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');
  const voiceCallViewSource = readFileSync(voiceCallViewPath, 'utf8');

  assert.match(liveControllerSource, /input_validation_error/);
  assert.match(liveControllerSource, /LiveContactCollection/);
  const extraConstraints = buildWebVoiceExtraConstraints({
    requiredContactFields: ['phone'],
    tzOffset: '+05:30',
    endCallInstruction: 'end call instruction',
    wrapWarningSignal: '[[WRAP]]',
    forceEndSignal: '[[END]]',
  });
  assert.match(extraConstraints, /do not accept spoken claims/i);
  assert.match(publicVoiceHookSource, /input_validation_error/);
  assert.match(widgetSource, /validateContactInput\(pendingInputField, text\)/);
  assert.match(voiceCallViewSource, /validateContactInput\(liveVoice\.requestedInputType, inputValue\)/);
  assert.doesNotMatch(widgetSource, /\(555\) 000-0000/);
  assert.doesNotMatch(voiceCallViewSource, /\(555\) 000-0000/);
});

test('live voice contact collection requests exactly one typed field at a time', async () => {
  const helper = await import(pathToFileURL(helperPath).href);
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');

  const requestTextInputTool = helper
    .buildLiveFunctionDeclarations(['title', 'visitorName', 'visitorPhone', 'startTime', 'endTime'])
    .find((tool: any) => tool.name === 'request_text_input');

  assert.match(requestTextInputTool.description, /exactly one field/i);
  assert.match(requestTextInputTool.description, /never request phone and email together/i);
  assert.match(requestTextInputTool.description, /before speaking/i);
  assert.match(requestTextInputTool.description, /do not announce/i);

  const persona = buildBusinessPersona(sampleBot, defaultWidgetConfig, {
    timezone: 'Asia/Kolkata',
    bookingInstruction: '3. booking instruction placeholder',
  });
  assert.match(persona, /request only ONE missing detail at a time/i);

  const extraConstraints = buildWebVoiceExtraConstraints({
    requiredContactFields: ['phone'],
    tzOffset: '+05:30',
    endCallInstruction: 'end call instruction',
    wrapWarningSignal: '[[WRAP]]',
    forceEndSignal: '[[END]]',
  });
  assert.match(extraConstraints, /first action in that turn/i);
  assert.match(extraConstraints, /never say.*calling.*tool/i);
  assert.match(extraConstraints, /do not claim.*text box.*visible/i);
  assert.match(liveControllerSource, /requestedTextInputThisToolTurn/);
  assert.match(liveControllerSource, /Request only one typed contact field at a time/i);
});

test('Gemini remains blocked until the server accepts the requested contact field', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');
  const publicVoiceHookSource = readFileSync(publicVoiceHookPath, 'utf8');
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');

  assert.match(liveControllerSource, /pendingContactToolCall/);
  assert.match(liveControllerSource, /functionResponses\.length\s*>\s*0/);
  assert.match(liveControllerSource, /type:\s*'input_validation_success'/);
  assert.match(liveControllerSource, /Verified typed \$\{submission\.field\}/);
  assert.doesNotMatch(liveControllerSource, /pendingTextInputField\s*\?\?/);
  assert.match(liveControllerSource, /contactCollection\.pendingField \|\| pendingContactToolCall/);
  assert.match(liveControllerSource, /message\.type !== 'textInput'/);
  assert.match(publicVoiceHookSource, /msg\.type === 'input_validation_success'/);
  assert.match(widgetSource, /msg\.type === 'input_validation_success'/);
});

test('live booking cannot run in a tool batch that requests contact input', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');

  assert.match(liveControllerSource, /batchRequestsContactInput/);
  assert.match(liveControllerSource, /getLiveBookingContactError/);
});

test('phone clients preserve overlong input so validation rejects it instead of truncating it', () => {
  const publicVoiceHookSource = readFileSync(publicVoiceHookPath, 'utf8');
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');
  const voiceCallViewSource = readFileSync(voiceCallViewPath, 'utf8');

  assert.doesNotMatch(voiceCallViewSource, /slice\(0,\s*10\)/);
  assert.doesNotMatch(widgetSource, /slice\(0,\s*10\)/);
  assert.doesNotMatch(voiceCallViewSource, /maxLength=\{liveVoice\.requestedInputType === 'phone' \? 10/);
  assert.match(publicVoiceHookSource, /input_validation_error/);
});

test('both phone UIs use a country selector and never advertise generic 7-15 digit validation', () => {
  const serverValidationSource = readFileSync(
    path.join(workspaceRoot, 'server', 'src', 'utils', 'contactValidation.ts'),
    'utf8'
  );
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');
  const voiceCallViewSource = readFileSync(voiceCallViewPath, 'utf8');

  assert.match(voiceCallViewSource, /PhoneInput/);
  assert.match(widgetSource, /phone-country-selector/);
  assert.match(widgetSource, /country-search/i);
  assert.doesNotMatch(serverValidationSource, /7\s*(?:to|-)\s*15/i);
  assert.doesNotMatch(widgetSource, /7\s*(?:to|-)\s*15/i);
  assert.doesNotMatch(voiceCallViewSource, /7\s*(?:to|-)\s*15/i);
  assert.doesNotMatch(
    widgetSource,
    /subscriber\s*=\s*subscriber\.replace\(\/\\D\/g/,
    'the widget must reject letters instead of silently removing them from a fake phone number'
  );
});

test('the live backend suppresses Gemini speech and text while contact verification is pending', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');

  assert.match(liveControllerSource, /canForwardLiveModelOutput/);
  assert.match(
    liveControllerSource,
    /response\.serverContent[\s\S]*canForwardLiveModelOutput\(contactCollection, pendingContactToolCall\)/
  );
  assert.match(liveControllerSource, /responseRequestsContactInput/);
});

test('the live backend can open the next contact textbox before Gemini speaks during booking intent', () => {
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');

  assert.match(liveControllerSource, /isLikelyBookingIntent/);
  assert.match(liveControllerSource, /openNextRequiredContactInput/);
  assert.match(liveControllerSource, /Please type your phone number in the text box/);
  assert.match(liveControllerSource, /Please type your email address in the text box/);
  assert.match(liveControllerSource, /resumeGeminiAfterProactiveContactCollection/);
});

test('both clients discard queued Gemini audio when a contact textbox opens', () => {
  const publicVoiceHookSource = readFileSync(publicVoiceHookPath, 'utf8');
  const widgetSource = readFileSync(widgetControllerPath, 'utf8');

  assert.match(publicVoiceHookSource, /resetPlaybackQueue\(\);[\s\S]*setRequestedInputType/);
  assert.match(widgetSource, /resetPlaybackQueue\(\);[\s\S]*pendingInputField = msg\.field/);
});

test('live sessions warn at 4 minutes and hard-stop at 5 minutes', async () => {
  const helper = await import(pathToFileURL(helperPath).href);
  const liveControllerSource = readFileSync(liveControllerPath, 'utf8');
  const geminiGuardSource = readFileSync(geminiGuardPath, 'utf8');

  assert.match(geminiGuardSource, /SESSION_WRAP_WARNING_MS\s*=\s*4 \* 60_000/);
  assert.match(geminiGuardSource, /SESSION_MAX_DURATION_MS\s*=\s*5 \* 60_000/);
  assert.match(geminiGuardSource, /registerSessionLifecycle/);
  assert.match(liveControllerSource, /registerSessionLifecycle/);
  assert.match(liveControllerSource, /LIVE_WRAP_WARNING_SIGNAL/);
  assert.match(liveControllerSource, /LIVE_FORCE_END_SIGNAL/);
  const extraConstraints = buildWebVoiceExtraConstraints({
    requiredContactFields: [],
    tzOffset: '+05:30',
    endCallInstruction: helper.LIVE_END_CALL_INSTRUCTION,
    wrapWarningSignal: helper.LIVE_WRAP_WARNING_SIGNAL,
    forceEndSignal: helper.LIVE_FORCE_END_SIGNAL,
  });
  assert.match(extraConstraints, /important class to attend soon/i);
  assert.match(helper.LIVE_WRAP_WARNING_SIGNAL, /\[\[SESSION_WRAP_WARNING\]\]/);
  assert.match(helper.LIVE_FORCE_END_SIGNAL, /\[\[SESSION_FORCE_END\]\]/);
});
