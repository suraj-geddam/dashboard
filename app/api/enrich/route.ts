import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import OpenAI from 'openai';

const { buildEnrichmentPrompt, parseEnrichmentResponse } = require('@/lib/enrichment-utils');

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 1. Get config
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

        console.log(`[Enrich] Starting enrichment with config:`, {
          baseURL: config.llm_base_url,
          model: model,
          apiKey: config.llm_api_key?.substring(0, 10) + '...'
        });

        // 2. Find stores needing enrichment
        const unenrichedStores = db.prepare(`
          SELECT DISTINCT o.store_name
          FROM orders o
          LEFT JOIN store_metadata sm ON o.store_name = sm.store_name
          WHERE sm.store_name IS NULL
        `).all() as { store_name: string }[];

        const totalStores = unenrichedStores.length;

        if (totalStores === 0) {
          send({ type: 'complete', enriched: 0, message: 'All stores already enriched' });
          controller.close();
          return;
        }

        send({ type: 'start', total: totalStores });

        // 3. Batch enrichment
        const BATCH_SIZE = 25;
        let enrichedCount = 0;

        for (let i = 0; i < unenrichedStores.length; i += BATCH_SIZE) {
          const batch = unenrichedStores.slice(i, i + BATCH_SIZE);
          const storeNames = batch.map(s => s.store_name);

          send({ type: 'progress', current: i, total: totalStores, status: `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...` });

          try {
            // Call LLM
            const prompt = buildEnrichmentPrompt(storeNames);
            console.log(`[Enrich] Calling LLM for batch ${Math.floor(i / BATCH_SIZE) + 1}, ${storeNames.length} stores`);
            console.log(`[Enrich] Model: ${model}, Base URL: ${config.llm_base_url}`);

            const completion = await openai.chat.completions.create({
              model,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0,
              max_tokens: 2000,
              timeout: 60000, // 60 second timeout
            });

            console.log(`[Enrich] LLM response received, ${completion.choices[0].message.content?.length || 0} chars`);
            let responseText = completion.choices[0].message.content?.trim() || '[]';

            const classifications = parseEnrichmentResponse(responseText, storeNames);
            console.log(`[Enrich] Parsed ${classifications.length} classifications`);

            // 4. Insert into database
            const insertStmt = db.prepare(`
              INSERT OR REPLACE INTO store_metadata
              (store_name, cuisine_type, store_category, price_range, enriched_at, enrichment_source, raw_llm_response)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const insertTransaction = db.transaction((items: any[]) => {
              for (const item of items) {
                insertStmt.run(
                  item.store_name,
                  item.cuisine_type,
                  item.store_category,
                  item.price_range,
                  new Date().toISOString(),
                  'llm_batch_v1',
                  JSON.stringify(item)
                );
              }
            });

            insertTransaction(classifications);
            enrichedCount += classifications.length;

            send({ type: 'progress', current: Math.min(i + batch.length, totalStores), total: totalStores, enriched: enrichedCount });

          } catch (batchError: any) {
            console.error('[Enrich] Batch enrichment error:', batchError);
            const errorMsg = batchError.message || String(batchError);
            console.error('[Enrich] Error details:', {
              name: batchError.name,
              message: batchError.message,
              code: batchError.code,
              status: batchError.status
            });
            send({
              type: 'error',
              message: `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${errorMsg}`,
              detail: batchError.code || batchError.name,
              batch: storeNames
            });
            // Continue with next batch instead of failing completely
          }
        }

        send({ type: 'complete', enriched: enrichedCount, total: totalStores });
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
