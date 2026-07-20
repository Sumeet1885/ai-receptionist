import { config } from '../../config';
import {
  DograhLoginResponse,
  DograhPhoneNumber,
  DograhRunDetail,
  DograhTelephonyConfig,
  DograhWorkflow,
} from './types';

const { apiUrl, email, password } = config.dograh;

export function isDograhConfigured(): boolean {
  return Boolean(apiUrl && email && password);
}

let cachedToken: string | null = null;

async function login(): Promise<string> {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Dograh login failed: ${response.status} ${await response.text()}`);
  }
  const data: DograhLoginResponse = await response.json();
  cachedToken = data.token;
  return cachedToken;
}

async function request<T>(path: string, init: RequestInit = {}, retrying = false): Promise<T> {
  if (!isDograhConfigured()) {
    throw new Error('Dograh is not configured (DOGRAH_EMAIL/DOGRAH_PASSWORD missing).');
  }
  const token = cachedToken ?? (await login());

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && !retrying) {
    cachedToken = null;
    return request<T>(path, init, true);
  }

  if (!response.ok) {
    throw new Error(`Dograh API error on ${path}: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// We author the workflow graph ourselves (see workflowDefinition.ts) instead of going through
// Dograh's create/template endpoint, which feeds free text to Dograh's own meta-LLM and
// reinterprets it into an unpredictable node graph. That indirection was the root cause of
// call-quality issues with small/literal models: ambiguous multi-node routing and disabled
// variable extraction. create/definition takes our literal JSON with no reinterpretation.
export function createWorkflowFromDefinition(
  name: string,
  workflowDefinition: Record<string, unknown>,
  workflowConfigurations?: Record<string, unknown>
): Promise<DograhWorkflow> {
  return request<DograhWorkflow>('/api/v1/workflow/create/definition', {
    method: 'POST',
    body: JSON.stringify({ name, workflow_definition: workflowDefinition, workflow_configurations: workflowConfigurations }),
  });
}

// PUT updates the same workflow id in place (as a new draft - see publishWorkflow), so
// re-provisioning never orphans a phone number's inbound_workflow_id binding to a stale id.
export function updateWorkflowInPlace(
  workflowId: string,
  workflowDefinition: Record<string, unknown>,
  workflowConfigurations?: Record<string, unknown>
): Promise<DograhWorkflow> {
  return request<DograhWorkflow>(`/api/v1/workflow/${workflowId}`, {
    method: 'PUT',
    body: JSON.stringify({ workflow_definition: workflowDefinition, workflow_configurations: workflowConfigurations }),
  });
}

// PUT saves a draft; only a published version is what actual calls execute, so call this right
// after updateWorkflowInPlace. (create/definition publishes the first version immediately on a
// fresh workflow, so this 400s with "No draft to publish" right after creation - harmless, the
// workflow is already live; only re-raise for any other failure.)
export async function publishWorkflow(workflowId: string | number): Promise<unknown> {
  try {
    return await request<unknown>(`/api/v1/workflow/${workflowId}/publish`, { method: 'POST' });
  } catch (err) {
    if (err instanceof Error && /No draft to publish/i.test(err.message)) return undefined;
    throw err;
  }
}

export interface HttpToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

export interface HttpToolPresetParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Fixed value or a `{{initial_context.*}}` / `{{gathered_context.*}}` template. */
  value_template: string;
}

export interface CreateHttpToolParams {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  parameters?: HttpToolParam[];
  presetParameters?: HttpToolPresetParam[];
}

function httpToolBody(params: CreateHttpToolParams) {
  return {
    name: params.name,
    category: 'http_api',
    description: params.description,
    definition: {
      type: 'http_api',
      config: {
        method: params.method,
        url: params.url,
        headers: params.headers,
        parameters: params.parameters,
        preset_parameters: params.presetParameters,
      },
    },
  };
}

// Tools are organization-wide objects in Dograh, but the URL/preset_parameters baked into ours
// are per-bot (bot id in the path, the X-API-Key header). createTool on first provision,
// updateTool (PUT, same tool_uuid) on every re-provision after that - see dograhController.ts,
// which persists the returned tool_uuid on the bot row precisely so it can tell which case it's in.
export function createHttpTool(params: CreateHttpToolParams): Promise<{ tool_uuid: string }> {
  return request<{ tool_uuid: string }>('/api/v1/tools/', {
    method: 'POST',
    body: JSON.stringify(httpToolBody(params)),
  });
}

export function updateHttpTool(toolUuid: string, params: CreateHttpToolParams): Promise<unknown> {
  return request<unknown>(`/api/v1/tools/${toolUuid}`, {
    method: 'PUT',
    body: JSON.stringify(httpToolBody(params)),
  });
}

export interface CreateEndCallToolParams {
  name: string;
  description: string;
  /** Recording id returned by createRecording - the audio is played verbatim, no TTS/LLM
   * involved. Omit for a silent immediate hangup (messageType "none") - e.g. the at-capacity
   * workflow, where there's no message to play at all, just an unconditional disconnect. */
  audioRecordingId?: string;
}

function endCallToolBody(params: CreateEndCallToolParams) {
  return {
    name: params.name,
    category: 'end_call',
    description: params.description,
    definition: {
      type: 'end_call',
      config: params.audioRecordingId
        ? { messageType: 'audio', audioRecordingId: params.audioRecordingId }
        : { messageType: 'none' },
    },
  };
}

export function createEndCallTool(params: CreateEndCallToolParams): Promise<{ tool_uuid: string }> {
  return request<{ tool_uuid: string }>('/api/v1/tools/', {
    method: 'POST',
    body: JSON.stringify(endCallToolBody(params)),
  });
}

export function updateEndCallTool(toolUuid: string, params: CreateEndCallToolParams): Promise<unknown> {
  return request<unknown>(`/api/v1/tools/${toolUuid}`, {
    method: 'PUT',
    body: JSON.stringify(endCallToolBody(params)),
  });
}

// One-time recording upload helper (recordings are organization-wide, not re-uploaded per bot).
// The current inbound rate-limit flow uses a silent end_call tool instead of a recording, but
// this helper is kept for future recorded greetings/decline messages.
export async function getRecordingUploadUrl(filename: string, mimeType: string, fileSizeBytes: number) {
  const data = await request<{ items: Array<{ upload_url: string; recording_id: string; storage_key: string }> }>(
    '/api/v1/workflow-recordings/upload-url',
    { method: 'POST', body: JSON.stringify({ files: [{ filename, mime_type: mimeType, file_size: fileSizeBytes }] }) }
  );
  return data.items[0];
}

export async function createRecording(recordingId: string, storageKey: string, transcript: string) {
  const data = await request<{ recordings: Array<{ recording_id: string }> }>('/api/v1/workflow-recordings/', {
    method: 'POST',
    body: JSON.stringify({ recordings: [{ recording_id: recordingId, storage_key: storageKey, transcript }] }),
  });
  return data.recordings[0];
}

export async function listTelephonyConfigs(): Promise<DograhTelephonyConfig[]> {
  const data = await request<{ configurations: DograhTelephonyConfig[] }>('/api/v1/organizations/telephony-configs');
  return data.configurations || [];
}

export async function listPhoneNumbers(configId: string | number): Promise<DograhPhoneNumber[]> {
  const data = await request<{ phone_numbers: DograhPhoneNumber[] }>(
    `/api/v1/organizations/telephony-configs/${configId}/phone-numbers`
  );
  return data.phone_numbers || [];
}

export async function assignInboundWorkflow(
  configId: string | number,
  phoneNumberId: string | number,
  workflowId: string | number
): Promise<DograhPhoneNumber> {
  return request<DograhPhoneNumber>(
    `/api/v1/organizations/telephony-configs/${configId}/phone-numbers/${phoneNumberId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ inbound_workflow_id: Number(workflowId) }),
    }
  );
}

export interface InitiateCallParams {
  workflowId: string | number;
  phoneNumber: string;
  telephonyConfigId: string | number;
  fromPhoneNumberId: string | number;
  /** Optional key-value map injected as Dograh's initial_context on the call.
   *  Use this to embed campaign metadata (e.g. campaign_contact_id) so the poller
   *  can reliably match the completed Dograh run back to the campaign contact row. */
  initialContext?: Record<string, unknown>;
}

export async function initiateCall(params: InitiateCallParams): Promise<unknown> {
  return request<unknown>('/api/v1/telephony/initiate-call', {
    method: 'POST',
    body: JSON.stringify({
      workflow_id: Number(params.workflowId),
      phone_number: params.phoneNumber,
      telephony_configuration_id: Number(params.telephonyConfigId),
      from_phone_number_id: Number(params.fromPhoneNumberId),
      ...(params.initialContext ? { initial_context: params.initialContext } : {}),
    }),
  });
}

export async function listRuns(workflowId: string, page = 1, limit = 50): Promise<DograhRunDetail[]> {
  const data = await request<{ runs: DograhRunDetail[] }>(
    `/api/v1/workflow/${workflowId}/runs?page=${page}&limit=${limit}`
  );
  return data.runs || [];
}

export async function getRun(workflowId: string, runId: string | number): Promise<DograhRunDetail> {
  return request<DograhRunDetail>(`/api/v1/workflow/${workflowId}/runs/${runId}`);
}

export async function fetchTranscript(transcriptUrl: string): Promise<unknown> {
  const response = await fetch(transcriptUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript at ${transcriptUrl}: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}
