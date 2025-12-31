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

        // Build system message with schema and rules
        const systemMessage = `You are a SQLite expert. Given the following database schema, write a SQL query to answer the user's question.

Current date: ${currentDate} (Year: ${currentYear}, Month: ${currentMonth})

${schema}

${fewShotExamples}

Rules:
1. Return ONLY the SQL query. No markdown, no explanation.
2. Use SQLite syntax and functions (strftime for dates, etc.)
3. When the question mentions cuisine types (Thai, Italian, Chinese, etc.), use store_metadata.cuisine_type
4. When the question mentions dish categories (Appetizer, Entree, etc.), use order_items.category
5. JOIN with store_metadata when filtering by cuisine, price, or store category
6. For relative time references (last year, last month, this year, etc.), use the current date provided above
7. Use conversation history to understand context and follow-up questions
8. Keep your reasoning brief and focused - just identify the key elements and write the query
9. If the question cannot be answered, return "SELECT 'Cannot answer' as error"`;

        // Build messages array with conversation history
        const messages: any[] = [
          { role: 'system', content: systemMessage }
        ];

        // Add conversation history (only user questions and SQL responses, not the full assistant messages)
        for (const msg of history) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant' && msg.sql) {
            // Include the SQL that was generated as the assistant's response
            messages.push({ role: 'assistant', content: msg.sql });
          }
        }

        // Add current query
        messages.push({ role: 'user', content: query });

        console.log(`[Query] Starting streaming query for: "${query}"`);
        console.log(`[Query] Using model: ${model}`);
        console.log(`[Query] Conversation history: ${history.length} previous messages`);

        // Generate SQL with streaming
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature: 0,
          max_tokens: 5000,  // Increased for reasoning models that may have long chain-of-thought
          stream: true,  // Enable token streaming
        });

        let fullReasoning = '';
        let fullSQL = '';
        let hasStartedReasoning = false;
        let hasStartedSQL = false;

        // Process streaming tokens
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta;

          // Handle reasoning tokens (Qwen chain-of-thought)
          if (delta?.reasoning_content) {
            if (!hasStartedReasoning) {
              send({ type: 'reasoning_start' });
              hasStartedReasoning = true;
            }
            fullReasoning += delta.reasoning_content;
            send({ type: 'reasoning_token', token: delta.reasoning_content });
          }

          // Handle content (SQL) tokens
          if (delta?.content) {
            if (!hasStartedSQL) {
              if (hasStartedReasoning) {
                send({ type: 'reasoning_complete', reasoning: fullReasoning });
              }
              send({ type: 'sql_start' });
              hasStartedSQL = true;
            }
            fullSQL += delta.content;
            send({ type: 'sql_token', token: delta.content });
          }
        }

        console.log(`[Query] Streaming complete. Reasoning: ${fullReasoning.length} chars, SQL: ${fullSQL.length} chars`);

        // Mark SQL generation as complete
        if (hasStartedSQL) {
          send({ type: 'sql_complete' });
        }

        // Clean and validate SQL
        let sql = fullSQL.trim().replace(/```sql/g, '').replace(/```/g, '').trim();

        console.log(`[Query] Cleaned SQL: ${sql}`);

        // Better SQL validation
        const isValidSQL = (s: string): boolean => {
          const cleaned = s.trim().toLowerCase();

          if (!cleaned.startsWith('select')) {
            return false;
          }

          // Check for common non-SQL responses
          const invalidPatterns = [
            /^select\s*$/,  // Just "SELECT" with nothing else
            /here is/i,
            /the query/i,
          ];

          for (const pattern of invalidPatterns) {
            if (pattern.test(s)) {
              return false;
            }
          }

          return true;
        };

        // Execute SQL
        if (isValidSQL(sql)) {
          send({ type: 'validating', status: 'Validating SQL...' });
          send({ type: 'executing', status: 'Executing query...' });

          try {
            const results = db.prepare(sql).all();
            send({ type: 'results', results, count: results.length, sql, reasoning: fullReasoning });
          } catch (dbError: any) {
            console.error('[Query] SQL execution error:', dbError);
            send({ type: 'error', message: `Failed to execute SQL: ${dbError.message}`, sql, reasoning: fullReasoning });
          }
        } else {
          console.error('[Query] Invalid SQL generated:', sql);
          send({
            type: 'error',
            message: 'Generated query was not a valid SELECT statement',
            sql,
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
