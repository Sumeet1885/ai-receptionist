export interface Bot {
  id: string;
  owner_id?: string;
  business_name?: string;
  businessName?: string;
  industry?: string;
  subdomain?: string;
  subDomain?: string;
  greeting?: string;
  primary_color?: string;
  primaryColor?: string;
  languages?: string[];
  knowledge_base?: string;
  knowledgeBase?: string;
  allowed_domains?: string[];
  widget_config?: any;
  phone_number?: string;
  phoneNumber?: string;
  createdAt?: string;
  created_at?: string;
  is_active?: boolean;
}

export interface Message {
  id?: string;
  sender?: 'bot' | 'user';
  text?: string;
  timestamp?: string;
  functionCall?: any;
  functionResponse?: any;
}
