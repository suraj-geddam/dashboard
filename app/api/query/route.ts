import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import OpenAI from 'openai';

// SSE streaming endpoint
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const query = req.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

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

        send({ type: 'generating', status: 'Generating SQL query...' });

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

        const prompt = `
You are a SQLite expert. Given the following database schema, write a SQL query to answer the user's question.

${schema}

${fewShotExamples}

User Question: "${query}"

Rules:
1. Return ONLY the SQL query. No markdown, no explanation.
2. Use SQLite syntax and functions (strftime for dates, etc.)
3. When the question mentions cuisine types (Thai, Italian, Chinese, etc.), use store_metadata.cuisine_type
4. When the question mentions dish categories (Appetizer, Entree, etc.), use order_items.category
5. JOIN with store_metadata when filtering by cuisine, price, or store category
6. If the question cannot be answered, return "SELECT 'Cannot answer' as error"
`;

        // Generate SQL
        const completion = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        });

        let sql = completion.choices[0].message.content?.trim() || '';
        sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();

        send({ type: 'sql', sql });

        // Execute SQL
        if (sql.toLowerCase().startsWith('select')) {
          send({ type: 'executing', status: 'Executing query...' });

          try {
            const results = db.prepare(sql).all();
            send({ type: 'results', results, count: results.length });
          } catch (dbError: any) {
            send({ type: 'error', message: `Failed to execute SQL: ${dbError.message}` });
          }
        } else {
          send({ type: 'error', message: 'Generated query was not a SELECT statement' });
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

// Keep existing POST endpoint for backwards compatibility
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Fetch config
    const configRows = db.prepare('SELECT key, value FROM config').all() as { key: string, value: string }[];
    const config = configRows.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const baseURL = config.llm_base_url || 'http://localhost:8080/v1';
    const apiKey = config.llm_api_key || 'sk-no-key-required';
    const model = config.llm_model || 'llama-3.2-3b-instruct';

    const openai = new OpenAI({
      baseURL,
      apiKey,
    });

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

    const prompt = `
You are a SQLite expert. Given the following database schema, write a SQL query to answer the user's question.

${schema}

${fewShotExamples}

User Question: "${query}"

Rules:
1. Return ONLY the SQL query. No markdown, no explanation.
2. Use SQLite syntax and functions (strftime for dates, etc.)
3. When the question mentions cuisine types (Thai, Italian, Chinese, etc.), use store_metadata.cuisine_type
4. When the question mentions dish categories (Appetizer, Entree, etc.), use order_items.category
5. JOIN with store_metadata when filtering by cuisine, price, or store category
6. If the question cannot be answered, return "SELECT 'Cannot answer' as error"
`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });

    let sql = completion.choices[0].message.content?.trim() || '';

    // Clean up markdown if present (just in case)
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();

    console.log('Generated SQL:', sql);

    if (sql.toLowerCase().startsWith('select')) {
      try {
        const results = db.prepare(sql).all();
        return NextResponse.json({ sql, results });
      } catch (dbError: any) {
        console.error('SQL Execution Error:', dbError);
        return NextResponse.json({ sql, error: 'Failed to execute SQL: ' + dbError.message });
      }
    } else {
      return NextResponse.json({ sql, error: 'Generated query was not a SELECT statement' });
    }

  } catch (error: any) {
    console.error('Query API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
