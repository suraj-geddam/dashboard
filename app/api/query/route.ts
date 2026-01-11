import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import OpenAI from 'openai';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
}

// SSE streaming endpoint - supports both GET and POST
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }
  return handleQuery(query, []);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, history } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    return handleQuery(query, history || []);
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// Tool definition for query_database
const tools = [
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

async function handleQuery(query: string, history: ConversationMessage[]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Fetch config
        const configRows = db.prepare('SELECT key, value FROM config').all() as { key: string, value: string }[];
        const config = configRows.reduce((acc, curr) => {
          acc[curr.key] = curr.value;
          return acc;
        }, {} as Record<string, string>);

        const openai = new OpenAI({
          baseURL: config.llm_base_url || 'http://localhost:8080/v1',
          apiKey: config.llm_api_key || 'sk-no-key-required',
        });
        const model = config.llm_model || 'llama-3.2-3b-instruct';

        // Build prompt (using same schema and examples as POST)
        const schema = `
Table: orders
Columns: id (TEXT), created_at (TEXT ISO8601), store_name (TEXT), delivery_time (TEXT), delivery_address (TEXT), total_amount (REAL)

Table: order_items
Columns: id (INTEGER), order_id (TEXT), item_name (TEXT), category (TEXT), unit_price (REAL), quantity (INTEGER), subtotal (REAL)
Foreign Key: order_items.order_id -> orders.id

Table: store_metadata
Columns: store_name (TEXT PRIMARY KEY), cuisine_type (TEXT nullable), store_category (TEXT), price_range (TEXT)
Description: Contains LLM-enriched metadata about stores. cuisine_type is the restaurant's cuisine (e.g., "Thai", "Italian", "Chinese"). store_category is the business type (e.g., "Restaurant", "Grocery", "Pharmacy"). price_range is "$" to "$$$$".
Foreign Key: Join with orders.store_name = store_metadata.store_name

IMPORTANT:
- When users ask about cuisine (e.g., "Thai food", "Italian restaurants"), use store_metadata.cuisine_type
- The order_items.category field contains dish categories like "Appetizer", "Entree", NOT cuisine types
- Always JOIN with store_metadata when filtering by cuisine, price range, or store category
`;

        const fewShotExamples = `
Examples:

Q: "How much did I spend on Thai food in 2024?"
A: SELECT SUM(o.total_amount) as total_spent FROM orders o JOIN store_metadata sm ON o.store_name = sm.store_name WHERE sm.cuisine_type = 'Thai' AND strftime('%Y', o.created_at) = '2024'

Q: "What's my favorite Italian restaurant?"
A: SELECT o.store_name, COUNT(*) as order_count FROM orders o JOIN store_metadata sm ON o.store_name = sm.store_name WHERE sm.cuisine_type = 'Italian' GROUP BY o.store_name ORDER BY order_count DESC LIMIT 1

Q: "Show me expensive restaurants I've ordered from"
A: SELECT DISTINCT o.store_name, sm.price_range FROM orders o JOIN store_metadata sm ON o.store_name = sm.store_name WHERE sm.price_range IN ('$$$', '$$$$') AND sm.store_category = 'Restaurant'

Q: "How much did I spend at pharmacies?"
A: SELECT SUM(o.total_amount) as total_spent FROM orders o JOIN store_metadata sm ON o.store_name = sm.store_name WHERE sm.store_category = 'Pharmacy'

Q: "What appetizers did I order from Thai restaurants?"
A: SELECT DISTINCT oi.item_name FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN store_metadata sm ON o.store_name = sm.store_name WHERE sm.cuisine_type = 'Thai' AND oi.category = 'Appetizer'
`;

        // Get current date for relative time references
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 0-indexed
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Build system message with tool calling instructions
        const systemMessage = `You are a DoorDash order analytics assistant. You help users understand their ordering patterns and provide recommendations.

Current date: ${currentDate} (Year: ${currentYear}, Month: ${currentMonth})

DATABASE SCHEMA:
${schema}

${fewShotExamples}

INSTRUCTIONS:

You have access to a query_database tool that lets you query the user's order history.

CRITICAL - When to use query_database:
- User asks about THEIR specific data: spending, orders, favorite items, etc.
- Questions like "How much did I...", "What's my favorite...", "Show me my top..."
- You can make MULTIPLE tool calls if the user asks multiple distinct questions

When NOT to use query_database:
- General knowledge questions ("What are popular Thai dishes?")
- Making recommendations or suggestions (use your knowledge!)
- Questions you can answer from previous query results

WHEN TO USE MULTIPLE QUERIES:
✓ User asks multiple distinct questions: "Thai spending? Also show top 5 stores"
✓ Questions require different filters/groupings that can't be combined
✓ User explicitly says "also", "and", "then" for separate data requests

WHEN TO USE ONE QUERY:
✓ Data can be retrieved in a single SELECT (e.g., both total and breakdown)
✓ User asks for data + recommendations (query data once, use knowledge for suggestions)

Example - Multiple queries needed:
Q: "How much did I spend on Thai food in 2025? Also, show me my top 5 stores."
✓ CORRECT: Query 1 (Thai spending with cuisine filter) + Query 2 (top stores, no filter)
✗ WRONG: Try to combine unrelated questions into one complex query

Example - One query enough:
Q: "What are my top 10 items and suggest new ones?"
✓ CORRECT: Query top 10 items → Use knowledge to suggest similar dishes
✗ WRONG: Query top 10 → Query cuisines → Query categories → Overthink

After getting query results:
- Answer in natural language with insights
- Use your food knowledge freely for recommendations
- Keep responses concise and helpful

Remember:
- Use ONE query when data can be retrieved together
- Use MULTIPLE queries when user asks distinct questions
- Don't re-query for data you already have`;

        // Build messages array with conversation history
        const messages: any[] = [
          { role: 'system', content: systemMessage }
        ];

        // Add conversation history (user questions and assistant responses)
        for (const msg of history) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant' && msg.content) {
            // Include the full assistant response for context
            messages.push({ role: 'assistant', content: msg.content });
          }
        }

        // Add current query
        messages.push({ role: 'user', content: query });

        console.log(`[Query] Starting streaming query for: "${query}"`);
        console.log(`[Query] Using model: ${model}`);
        console.log(`[Query] Conversation history: ${history.length} previous messages`);

        // Generate response with tool calling support
        const completion = await openai.chat.completions.create({
          model,
          messages,
          tools,  // Include tool definitions
          temperature: 0,
          max_tokens: 10000,  // Increased for reasoning models that may have long chain-of-thought
          stream: true,  // Enable token streaming
        });

        let fullReasoning = '';
        let fullResponse = '';
        let toolCalls: any[] = [];

        // Process streaming tokens
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta;
          const finishReason = chunk.choices[0]?.finish_reason;

          // Handle reasoning tokens (Qwen chain-of-thought)
          // Note: reasoning_content is not in standard types but supported by some models
          const deltaAny = delta as any;
          if (deltaAny?.reasoning_content) {
            fullReasoning += deltaAny.reasoning_content;
            send({ type: 'reasoning_token', token: deltaAny.reasoning_content });
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              if (!toolCalls[index]) {
                // Initialize new tool call at this index
                toolCalls[index] = {
                  index,
                  id: toolCallDelta.id || '',
                  type: 'function',
                  function: {
                    name: toolCallDelta.function?.name || '',
                    arguments: ''
                  }
                };

                if (toolCallDelta.function?.name) {
                  send({ type: 'tool_call_start', name: toolCallDelta.function.name });
                }
              } else if (toolCallDelta.id) {
                // Update ID if provided in a later delta
                toolCalls[index].id = toolCallDelta.id;
              }

              if (toolCallDelta.function?.arguments) {
                toolCalls[index].function.arguments += toolCallDelta.function.arguments;
              }
            }
          }

          // Handle regular content (text response)
          if (delta?.content) {
            fullResponse += delta.content;
            send({ type: 'content_token', token: delta.content });
          }

          // Check if done
          if (finishReason === 'tool_calls') {
            send({ type: 'tool_calls_complete' });
            break;
          } else if (finishReason === 'stop') {
            send({ type: 'response_complete' });
            break;
          }
        }

        console.log(`[Query] Streaming complete. Tool calls: ${toolCalls.length}, Response: ${fullResponse.length} chars`);

        // SQL validation function
        const isValidSQL = (s: string): boolean => {
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
        };

        // If model called tools, execute them and continue
        if (toolCalls.length > 0) {
          console.log(`[Query] Model called ${toolCalls.length} tool(s)`);

          const toolResults = [];

          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'query_database') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                const sql = args.sql.trim();

                console.log(`[Query] Executing SQL from tool call: ${sql}`);
                send({ type: 'executing_sql', sql, explanation: args.explanation });

                if (isValidSQL(sql)) {
                  const results = db.prepare(sql).all();

                  toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool' as const,
                    name: 'query_database',
                    content: JSON.stringify({
                      success: true,
                      results,
                      count: results.length
                    })
                  });

                  send({ type: 'sql_results', results, count: results.length });
                } else {
                  toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool' as const,
                    name: 'query_database',
                    content: JSON.stringify({
                      success: false,
                      error: 'Invalid SQL query - must be read-only SELECT, WITH, or EXPLAIN'
                    })
                  });

                  send({ type: 'sql_error', message: 'Invalid SQL query' });
                }
              } catch (err: any) {
                console.error('[Query] Tool execution error:', err);
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool' as const,
                  name: 'query_database',
                  content: JSON.stringify({
                    success: false,
                    error: err.message
                  })
                });

                send({ type: 'sql_error', message: err.message });
              }
            }
          }

          // Continue conversation with tool results
          console.log('[Query] Continuing conversation with tool results');
          send({ type: 'generating_response' });

          const continuationMessages = [
            ...messages,
            {
              role: 'assistant' as const,
              content: fullResponse || null,
              tool_calls: toolCalls
            },
            ...toolResults
          ];

          const finalCompletion = await openai.chat.completions.create({
            model,
            messages: continuationMessages,
            temperature: 0,
            max_tokens: 3000,
            stream: true,
          });

          let finalResponse = '';

          for await (const chunk of finalCompletion) {
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              finalResponse += delta.content;
              send({ type: 'content_token', token: delta.content });
            }
          }

          // Send final response
          send({
            type: 'final_response',
            content: finalResponse,
            reasoning: fullReasoning,
            tool_calls: toolCalls.map(tc => ({
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            }))
          });

        } else {
          // No tool calls - model answered directly
          send({
            type: 'final_response',
            content: fullResponse,
            reasoning: fullReasoning
          });
        }

        controller.close();

      } catch (error: any) {
        send({ type: 'error', message: error.message });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
