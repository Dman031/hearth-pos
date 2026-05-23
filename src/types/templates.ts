export type TicketFormat =
  | 'direct'
  | 'bid'
  | 'recurring'
  | 'order'
  | 'task'
  | 'dispatch_outbound';

export interface MenuModifier {
  name: string;
  options: string[];
  default?: string;
  price_adjustments?: Record<string, number>;
}

export interface MenuConfig {
  categories: string[];
  modifiers: MenuModifier[];
}

export interface TemplateConfig {
  profile_fields: string[];
  ticket_format: TicketFormat;
  features: Record<string, boolean>;
  home_screen: string[];
  menu_config?: MenuConfig;
  onboarding_conversation: string[];
  mcp_capabilities: string[];
}
