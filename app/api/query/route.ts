import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getOpenAIClient, getModel } from '@/lib/openai';
import { buildSystemPrompt } from '@/lib/query-prompts';
import { QUERY_TOOLS, executeToolCall } from '@/lib/query-tools';

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

// Use tool definitions from query-tools module
const tools = QUERY_TOOLS;

async function handleQuery(query: string, history: ConversationMessage[]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Get OpenAI client and model
        const openai = getOpenAIClient();
        const model = getModel();

        // Get current date for system prompt
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 0-indexed
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Build system message
        const systemMessage = buildSystemPrompt(currentDate, currentYear, currentMonth);

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
          parallel_tool_calls: true
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

        // If model called tools, execute them and continue
        if (toolCalls.length > 0) {
          console.log(`[Query] Model called ${toolCalls.length} tool(s)`);

          const toolResults = [];

          for (const toolCall of toolCalls) {
            const result = executeToolCall(toolCall, {
              onExecute: (sql, explanation) => {
                send({ type: 'executing_sql', sql, explanation });
              },
              onSuccess: (results, count) => {
                send({ type: 'sql_results', results, count });
              },
              onError: (message) => {
                send({ type: 'sql_error', message });
              }
            });
            toolResults.push(result);
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
