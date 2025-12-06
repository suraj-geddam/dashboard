import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const config = db.prepare('SELECT key, value FROM config').all() as { key: string, value: string }[];
    const configMap = config.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json(configMap);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { llm_provider, llm_base_url, llm_api_key, llm_model } = body;

    const update = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');

    const transaction = db.transaction(() => {
      if (llm_provider !== undefined) update.run('llm_provider', llm_provider);
      if (llm_base_url !== undefined) update.run('llm_base_url', llm_base_url);
      if (llm_api_key !== undefined) update.run('llm_api_key', llm_api_key);
      if (llm_model !== undefined) update.run('llm_model', llm_model);
    });

    transaction();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
