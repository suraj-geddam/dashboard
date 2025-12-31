import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import OpenAI from 'openai';

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

    const prompt = `
You are a SQLite expert. Given the following database schema, write a SQL query to answer the user's question.
${schema}

User Question: "${query}"

Rules:
1. Return ONLY the SQL query. No markdown, no explanation.
2. Use SQLite syntax.
3. Do not use markdown code blocks.
4. If the question cannot be answered, return "SELECT 'Cannot answer' as error".
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
