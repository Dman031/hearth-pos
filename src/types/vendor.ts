export type SubscriptionStatus = 'free' | 'active' | 'cancelled';

export interface VendorProfile {
  id: string; // uuid PK
  user_id: string; // uuid FK auth.users
  business_name: string | null;
  category: string | null;
  description: string | null;
  service_area: unknown[]; // jsonb default '[]'
  hours_of_operation: unknown | null; // jsonb
  photos: string[]; // jsonb default '[]'
  rating: number; // numeric(3,2) default 0
  rating_count: number; // default 0
  response_time_minutes: number | null;
  completion_rate: number; // numeric(5,2) default 100
  cancellation_rate: number; // numeric(5,2) default 0
  is_live: boolean; // default false
  stripe_account_id: string | null;
  template_id: string | null; // FK pos_templates
  completed_transaction_count: number; // default 0
  subscription_status: SubscriptionStatus; // default 'free'
  stripe_subscription_id: string | null;
  mcp_capabilities: unknown[]; // jsonb default '[]'
  referral_code: string | null; // unique
  available_for_tasks: boolean; // default false
  task_radius_miles: number | null;
  task_types_accepted: unknown[]; // jsonb default '[]'
  created_at: string; // timestamptz → ISO string
  updated_at: string; // timestamptz → ISO string
}
