'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, ChevronDown, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  tool_calls?: Array<{
    name: string;
    args: any;
    results?: any[];
  }>;
  error?: string;
  // Legacy fields for backward compatibility
  sql?: string;
  data?: any[];
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! Ask me anything about your DoorDash orders. For example: "How much did I spend on Thai food last month?"' }
  ]);
  const [loading, setLoading] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [currentToolCalls, setCurrentToolCalls] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingReasoning, streamingResponse, currentToolCalls]);

  const handleSend = async () => {
    if (!query.trim()) return;

    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    setStreamingReasoning('');
    setStreamingResponse('');
    setCurrentToolCalls([]);

    try {
      // Send conversation history with the query
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMsg,
          history: messages.map(m => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect to server');
      }

      // Parse SSE stream manually
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process complete lines
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'reasoning_token':
                  setStreamingReasoning(prev => prev + data.token);
                  break;

                case 'tool_call_start':
                  console.log(`Tool call: ${data.name}`);
                  break;

                case 'executing_sql':
                  // Show SQL being executed
                  setCurrentToolCalls(prev => [...prev, {
                    name: 'query_database',
                    sql: data.sql,
                    explanation: data.explanation,
                    status: 'executing'
                  }]);
                  break;

                case 'sql_results':
                  // Update tool call with results
                  setCurrentToolCalls(prev => prev.map(tc =>
                    tc.status === 'executing'
                      ? { ...tc, results: data.results, status: 'complete' }
                      : tc
                  ));
                  break;

                case 'sql_error':
                  // Mark tool call as failed
                  setCurrentToolCalls(prev => prev.map(tc =>
                    tc.status === 'executing'
                      ? { ...tc, error: data.message, status: 'failed' }
                      : tc
                  ));
                  break;

                case 'content_token':
                  setStreamingResponse(prev => prev + data.token);
                  break;

                case 'final_response':
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.content,
                    reasoning: data.reasoning,
                    tool_calls: data.tool_calls
                  }]);
                  setStreamingResponse('');
                  setStreamingReasoning('');
                  setCurrentToolCalls([]);
                  setLoading(false);
                  break;

                case 'error':
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'I encountered an error processing your request.',
                    error: data.message
                  }]);
                  setStreamingResponse('');
                  setStreamingReasoning('');
                  setCurrentToolCalls([]);
                  setLoading(false);
                  break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, connection to server lost.',
        error: String(error)
      }]);
      setStreamingReasoning('');
      setStreamingResponse('');
      setCurrentToolCalls([]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="mb-4">
        <h2 className="text-3xl font-bold text-gray-900">Ask AI</h2>
        <p className="text-gray-500 mt-1">Natural language analytics powered by your local or hosted LLM.</p>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-900 text-white' : 'bg-[#FF3008] text-white'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`max-w-[80%] space-y-2`}>
                {/* Reasoning (shown first) */}
                {msg.reasoning && (
                  <details className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                      <ChevronDown size={14} className="transition-transform" />
                      Show reasoning ({msg.reasoning.length} chars)
                    </summary>
                    <pre className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200 overflow-x-auto max-h-60">
                      {msg.reasoning}
                    </pre>
                  </details>
                )}

                {/* Tool calls display (for assistant messages) */}
                {msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && (
                  <details className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                      <ChevronDown size={14} className="transition-transform" />
                      🔧 Queried database ({msg.tool_calls.length} {msg.tool_calls.length === 1 ? 'query' : 'queries'})
                    </summary>
                    {msg.tool_calls.map((tc, i) => (
                      <div key={i} className="border-t border-gray-200 p-3">
                        <div className="text-xs text-gray-500 mb-1">{tc.args.explanation}</div>
                        <code className="text-xs bg-gray-900 text-gray-100 p-2 rounded block overflow-x-auto">
                          {tc.args.sql}
                        </code>
                        {tc.results && (
                          <div className="mt-2 text-xs text-gray-500">
                            → {tc.results.length} {tc.results.length === 1 ? 'result' : 'results'}
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                )}

                {/* Main message content */}
                <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-gray-100 text-gray-900 rounded-tr-none' : 'bg-red-50 text-gray-900 rounded-tl-none'}`}>
                  {msg.role === 'user' ? (
                    <p>{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.error && (
                  <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
                    Error: {msg.error}
                  </div>
                )}

                {msg.sql && (
                  <div className="bg-gray-800 text-gray-200 p-3 rounded-lg text-xs font-mono overflow-x-auto flex gap-2">
                    <Code size={14} className="flex-shrink-0 mt-0.5" />
                    <code>{msg.sql}</code>
                  </div>
                )}

                {msg.data && msg.data.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 font-medium">
                          <tr>
                            {Object.keys(msg.data[0]).map((key) => (
                              <th key={key} className="px-4 py-2 whitespace-nowrap">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {msg.data.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="px-4 py-2 whitespace-nowrap text-gray-600">
                                  {typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(2) : val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {msg.data && msg.data.length === 0 && !msg.error && (
                  <div className="text-sm text-gray-500 italic">No results found.</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[#FF3008] text-white flex items-center justify-center flex-shrink-0">
                <Bot size={16} />
              </div>
              <div className="max-w-[80%] space-y-2">
                {/* Streaming Reasoning */}
                {streamingReasoning && (
                  <details open className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                      <ChevronDown size={14} className="transition-transform" />
                      Reasoning ({streamingReasoning.length} chars)
                    </summary>
                    <pre className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200 overflow-x-auto max-h-60">
                      {streamingReasoning}<span className="animate-pulse">▊</span>
                    </pre>
                  </details>
                )}

                {/* Streaming Tool Calls */}
                {currentToolCalls.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-2">🔍 Querying database...</div>
                    {currentToolCalls.map((tc, i) => (
                      <div key={i} className="mb-2 last:mb-0">
                        <div className="text-xs text-gray-600 mb-1">{tc.explanation}</div>
                        <code className="text-xs bg-gray-800 text-gray-100 p-2 rounded block overflow-x-auto">
                          {tc.sql}
                        </code>
                        {tc.status === 'executing' && (
                          <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Executing...
                          </div>
                        )}
                        {tc.status === 'complete' && tc.results && (
                          <div className="text-xs text-green-600 mt-1">
                            ✓ {tc.results.length} {tc.results.length === 1 ? 'result' : 'results'}
                          </div>
                        )}
                        {tc.status === 'failed' && (
                          <div className="text-xs text-red-600 mt-1">
                            ✗ {tc.error || 'Query failed'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Streaming Response */}
                {streamingResponse && (
                  <div className="bg-red-50 p-4 rounded-2xl rounded-tl-none">
                    <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900">
                      <ReactMarkdown>{streamingResponse}</ReactMarkdown>
                    </div>
                    <span className="animate-pulse">▊</span>
                  </div>
                )}

                {/* Loading indicator when no tokens yet */}
                {!streamingReasoning && !streamingResponse && currentToolCalls.length === 0 && (
                  <div className="bg-red-50 p-4 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-5 h-5 animate-spin text-[#FF3008]" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data..."
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF3008] focus:border-transparent text-gray-900"
            />
            <button
              onClick={handleSend}
              disabled={!query.trim() || loading}
              className="bg-[#FF3008] text-white p-3 rounded-xl hover:bg-[#E02906] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
