export interface Bot {
  id: string;
  businessName: string;
  industry: string;
  subDomain: string;
  greeting: string;
  primaryColor: string;
  languages: string[];
  knowledgeBase: string;
  createdAt: string;
}

export interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
}
