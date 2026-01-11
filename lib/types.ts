/**
 * Shared TypeScript types and interfaces used across the application
 */

// ===== Database Row Types =====

export interface Order {
  id: string;
  created_at: string;
  store_name: string;
  delivery_time: string | null;
  delivery_address: string | null;
  total_amount: number;
}

export interface OrderItem {
  id: number;
  order_id: string;
  item_name: string;
  category: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface StoreMetadata {
  store_name: string;
  cuisine_type: string | null;
  store_category: string;
  price_range: string;
  enriched_at?: string;
  enrichment_source?: string;
  raw_llm_response?: string;
}

export interface ConfigRow {
  key: string;
  value: string;
}

// ===== LLM Configuration =====

export interface LLMConfig {
  llm_provider: 'local' | 'hosted';
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
}

// ===== Dashboard API Response Types =====

export interface YoYChanges {
  totalSpend: number;
  totalOrders: number;
  avgOrderValue: number;
}

export interface MonthlySpendData {
  month: string;  // Format: YYYY-MM
  total: number;
}

export interface CategoryData {
  category: string;
  total: number;
}

export interface TopStoreData {
  store_name: string;
  total: number;
}

export interface DashboardStats {
  totalSpend: number;
  totalOrders: number;
  topStores: TopStoreData[];
  monthlySpend: MonthlySpendData[];
  categoryDist: CategoryData[];
  yoyChanges: YoYChanges | null;
}

// ===== Query System Types =====

export interface ToolCall {
  name: string;
  args: {
    sql: string;
    explanation: string;
  };
  results?: Record<string, unknown>[];
}

export interface QueryMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  error?: string;
  // Legacy fields for backward compatibility
  sql?: string;
  data?: Record<string, unknown>[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  error?: string;
  // Legacy fields for backward compatibility
  sql?: string;
  data?: Record<string, unknown>[];
}

export interface QueryStreamEvent {
  type: 'reasoning_token' | 'content_token' | 'tool_call_start' | 'executing_sql' |
        'sql_results' | 'sql_error' | 'tool_calls_complete' | 'response_complete' |
        'final_response' | 'error';
  token?: string;
  name?: string;
  sql?: string;
  explanation?: string;
  results?: Record<string, unknown>[];
  count?: number;
  message?: string;
  content?: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  error?: string;
}

// ===== Upload System Types =====

export interface UploadResponse {
  message: string;
  ordersImported: number;
  itemsImported: number;
}

export interface EnrichmentProgress {
  type: 'start' | 'progress' | 'complete' | 'error';
  total?: number;
  processed?: number;
  enriched?: number;
  message?: string;
  error?: string;
}
