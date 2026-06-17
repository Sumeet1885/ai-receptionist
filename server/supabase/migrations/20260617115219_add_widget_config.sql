ALTER TABLE public.bots
ADD COLUMN IF NOT EXISTS widget_config jsonb DEFAULT '{
  "assistantName": "",
  "avatarText": "",
  "theme": "dark",
  "primaryColor": "#22e6a8",
  "backgroundColor": "#0b1511",
  "surfaceColor": "#10231d",
  "textColor": "#f7fffb",
  "launcherPosition": "bottom-right",
  "launcherStyle": "icon",
  "launcherText": "Chat",
  "widgetSize": "standard",
  "radius": "soft",
  "inputPlaceholder": "Type a message...",
  "suggestedPrompts": [],
  "enableVoice": true,
  "enableCalendar": true,
  "showPoweredBy": true,
  "requiredLeadFields": ["name", "phone"],
  "handoffText": "I can connect you with the team for this."
}'::jsonb;

UPDATE public.bots
SET widget_config = '{}'::jsonb
WHERE widget_config IS NULL;
