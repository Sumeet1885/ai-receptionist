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

export interface DograhTelephonyConfigDetail {
  id: number;
  name: string;
  provider: string;
  is_default_outbound: boolean;
  credentials?: Record<string, unknown>;
  stasis_app_name?: string;
  created_at: string;
  updated_at: string;
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

export interface DograhProvisionableBot {
  id: string;
  owner_id: string;
  business_name: string;
  industry: string;
  knowledge_base: string;
  dograh_workflow_id?: string | null;
  dograh_outbound_workflow_id?: string | null;
  dograh_capacity_workflow_id?: string | null;
  dograh_telephony_config_id?: string | null;
  dograh_phone_number_id?: string | null;
  dograh_phone_number?: string | null;
  dograh_check_availability_tool_uuid?: string | null;
  dograh_book_appointment_tool_uuid?: string | null;
  dograh_call_time_tool_uuid?: string | null;
  dograh_rate_limit_tool_uuid?: string | null;
  dograh_outbound_cooldown_seconds?: number;
  dograh_outbound_hourly_cap?: number;
  dograh_inbound_cooldown_seconds?: number;
  dograh_inbound_hourly_cap?: number;
  dograh_inbound_active_workflow?: 'normal' | 'capacity' | string | null;
  dograh_inbound_rate_limited_until?: string | null;
  widget_config?: any;
}

export interface ConnectedPhoneLine {
  id: string;
  phoneNumber: string;
  type: 'inbound' | 'outbound' | 'both' | 'forwarding';
  provider: 'twilio' | 'plivo' | 'vonage' | 'telnyx' | 'forwarding' | 'asterisk' | 'pool' | 'custom';
  label?: string | null;
  status: 'active' | 'inactive';
  isPrimaryInbound?: boolean;
  isPrimaryOutbound?: boolean;
  configuredAt: string;
  telephonyConfigId?: string | number | null;
  phoneNumberId?: string | number | null;
  credentials?: any;
}
