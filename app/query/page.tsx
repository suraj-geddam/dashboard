'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Code, ChevronDown } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: any[];
  error?: string;
  reasoning?: string;
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! Ask me anything about your DoorDash orders. For example: "How much did I spend on Thai food last month?"' }
  ]);
  const [loading, setLoading] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingSQL, setStreamingSQL] = useState('');
  const [showStreamingReasoning, setShowStreamingReasoning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingReasoning, streamingSQL]);

  const handleSend = async () => {
    if (!query.trim()) return;

    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    setStreamingReasoning('');
    setStreamingSQL('');
    setShowStreamingReasoning(false);

    try {
      // Send conversation history with the query
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMsg,
          history: messages.filter(m => m.role === 'user' || (m.role === 'assistant' && m.sql)).map(m => ({
            role: m.role,
            content: m.content,
            sql: m.sql
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
                case 'reasoning_start':
                  setShowStreamingReasoning(true);
                  break;

                case 'reasoning_token':
                  setStreamingReasoning(prev => prev + data.token);
                  break;

                case 'reasoning_complete':
                  break;

                case 'sql_start':
                  break;

                case 'sql_token':
                  setStreamingSQL(prev => prev + data.token);
                  break;

                case 'sql_complete':
                  break;

                case 'validating':
                case 'executing':
                  break;

                case 'results':
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Here is what I found:`,
                    sql: data.sql,
                    data: data.results,
                    reasoning: data.reasoning
                  }]);
                  setStreamingReasoning('');
                  setStreamingSQL('');
                  setLoading(false);
                  break;

                case 'error':
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'I encountered an error processing your request.',
                    error: data.message,
                    sql: data.sql,
                    reasoning: data.reasoning
                  }]);
                  setStreamingReasoning('');
                  setStreamingSQL('');
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
      setStreamingSQL('');
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
                <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-gray-100 text-gray-900 rounded-tr-none' : 'bg-red-50 text-gray-900 rounded-tl-none'}`}>
                  <p>{msg.content}</p>
                </div>

                {msg.error && (
                  <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
                    Error: {msg.error}
                  </div>
                )}

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
                  <details open={showStreamingReasoning} className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                      <ChevronDown size={14} className="transition-transform" />
                      Reasoning ({streamingReasoning.length} chars)
                    </summary>
                    <pre className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200 overflow-x-auto max-h-60">
                      {streamingReasoning}<span className="animate-pulse">▊</span>
                    </pre>
                  </details>
                )}

                {/* Streaming SQL */}
                {streamingSQL && (
                  <div className="bg-gray-800 text-gray-200 p-3 rounded-lg">
                    <div className="text-xs text-gray-400 mb-2">Generating SQL...</div>
                    <code className="text-xs font-mono">
                      {streamingSQL}<span className="animate-pulse">▊</span>
                    </code>
                  </div>
                )}

                {/* Loading indicator when no tokens yet */}
                {!streamingReasoning && !streamingSQL && (
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
