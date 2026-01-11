/**
 * Query tool definitions and execution
 */

import db from '@/lib/db';

// Tool definition for query_database
export const QUERY_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'query_database',
      description: 'Execute a read-only SQL query on the user\'s DoorDash order database to retrieve information about their orders, restaurants, items, and spending patterns.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid SQLite SELECT, WITH, or EXPLAIN query. Must be read-only (no INSERT/UPDATE/DELETE).'
          },
          explanation: {
            type: 'string',
            description: 'Brief explanation of what this query does and why it\'s needed to answer the user\'s question.'
          }
        },
        required: ['sql', 'explanation']
      }
    }
  }
];

/**
 * Validates that a SQL query is read-only
 */
export function isValidSQL(s: string): boolean {
  const cleaned = s.trim().toLowerCase();

  if (!cleaned || cleaned.length < 6) return false;

  // Check for write operations
  const writeOperations = [
    /^\s*insert\s+/i, /^\s*update\s+/i, /^\s*delete\s+/i,
    /^\s*drop\s+/i, /^\s*create\s+/i, /^\s*alter\s+/i,
    /^\s*truncate\s+/i, /^\s*replace\s+/i,
  ];

  for (const pattern of writeOperations) {
    if (pattern.test(s)) return false;
  }

  // Must start with valid read operation
  const validStarts = [/^\s*select\s+/i, /^\s*with\s+/i, /^\s*explain\s+/i];
  return validStarts.some(pattern => pattern.test(s));
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
}

export interface ToolExecutionCallbacks {
  onExecute?: (sql: string, explanation: string) => void;
  onSuccess?: (results: any[], count: number) => void;
  onError?: (message: string) => void;
}

/**
 * Execute a query_database tool call
 * @param toolCall - The tool call to execute
 * @param callbacks - Optional callbacks for execution events
 * @returns Tool result to send back to LLM
 */
export function executeToolCall(toolCall: ToolCall, callbacks?: ToolExecutionCallbacks): ToolResult {
  if (toolCall.function.name === 'query_database') {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const sql = args.sql.trim();

      console.log(`[Query] Executing SQL from tool call: ${sql}`);
      callbacks?.onExecute?.(sql, args.explanation);

      if (isValidSQL(sql)) {
        const results = db.prepare(sql).all();

        callbacks?.onSuccess?.(results, results.length);

        return {
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: 'query_database',
          content: JSON.stringify({
            success: true,
            results,
            count: results.length
          })
        };
      } else {
        const errorMsg = 'Invalid SQL query - must be read-only SELECT, WITH, or EXPLAIN';
        callbacks?.onError?.(errorMsg);

        return {
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: 'query_database',
          content: JSON.stringify({
            success: false,
            error: errorMsg
          })
        };
      }
    } catch (err: any) {
      console.error('[Query] Tool execution error:', err);
      callbacks?.onError?.(err.message);

      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        name: 'query_database',
        content: JSON.stringify({
          success: false,
          error: err.message
        })
      };
    }
  }

  // Unknown tool
  return {
    tool_call_id: toolCall.id,
    role: 'tool' as const,
    name: toolCall.function.name,
    content: JSON.stringify({
      success: false,
      error: `Unknown tool: ${toolCall.function.name}`
    })
  };
}
