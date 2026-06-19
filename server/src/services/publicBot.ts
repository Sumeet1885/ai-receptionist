import { mergeWidgetConfig } from '../utils/widgetConfig';

export function toPublicBotResponse(bot: any) {
  return {
    id: bot.id,
    business_name: bot.business_name,
    industry: bot.industry,
    subdomain: bot.subdomain,
    greeting: bot.greeting,
    primary_color: bot.primary_color,
    languages: Array.isArray(bot.languages) ? bot.languages : ['English'],
    widget_config: mergeWidgetConfig(bot.widget_config, bot),
  };
}
