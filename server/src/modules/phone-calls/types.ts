export interface DograhLoginResponse {
  token: string;
  user: { id?: number | string; email?: string; organization_id?: number | string };
}

export interface DograhWorkflow {
  id: number;
  name: string;
  status: string;
  workflow_uuid?: string | null;
  created_at: string;
}

export interface DograhTelephonyConfig {
  id: number;
  name: string;
  provider: string;
}

export interface DograhPhoneNumber {
  id: number;
  telephony_configuration_id: number;
  address: string;
  label?: string | null;
  inbound_workflow_id?: number | null;
  inbound_workflow_name?: string | null;
  is_active: boolean;
}

export interface DograhRunSummary {
  id: number;
  workflow_id: number;
  created_at: string;
  is_completed: boolean;
}

export interface DograhRunDetail extends DograhRunSummary {
  // *_url fields are internal storage keys (e.g. "transcripts/47.txt") — NOT fetchable as-is.
  // The *_public_url fields are the absolute, downloadable URLs. Always fetch/store the public
  // ones; fetching transcript_url directly throws (relative URL) and silently breaks mirroring.
  transcript_url: string | null;
  transcript_public_url: string | null;
  recording_url: string | null;
  recording_public_url: string | null;
  cost_info: Record<string, unknown> | null;
  usage_info: Record<string, unknown> | null;
  initial_context: Record<string, unknown> | null;
  gathered_context: Record<string, unknown> | null;
  call_type: 'inbound' | 'outbound';
}

/** Minimal bot fields the phone-calls module needs; avoids importing the full bots row type. */
export interface DograhProvisionableBot {
  id: string;
  owner_id: string;
  business_name: string;
  industry: string;
  knowledge_base: string;
  dograh_workflow_id?: string | null;
  dograh_outbound_workflow_id?: string | null;
  dograh_telephony_config_id?: string | null;
  dograh_phone_number_id?: string | null;
  dograh_phone_number?: string | null;
}
