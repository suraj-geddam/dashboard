'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Code } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: any[];
  error?: string;
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! Ask me anything about your DoorDash orders. For example: "How much did I spend on Thai food last month?"' }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!query.trim()) return;

    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    // SSE streaming
    const eventSource = new EventSource(`/api/query?q=${encodeURIComponent(userMsg)}`);
    let currentSql = '';
    let currentStatus = '';

    eventSource.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case 'generating':
          currentStatus = data.status;
          break;

        case 'sql':
          currentSql = data.sql;
          break;

        case 'executing':
          // Status update
          break;

        case 'results':
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Here is what I found for "${userMsg}":`,
            sql: currentSql,
            data: data.results
          }]);
          setLoading(false);
          eventSource.close();
          break;

        case 'error':
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'I encountered an error processing your request.',
            error: data.message,
            sql: currentSql
          }]);
          setLoading(false);
          eventSource.close();
          break;
      }
    });

    eventSource.addEventListener('error', () => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, connection to server lost.' }]);
      setLoading(false);
      eventSource.close();
    });
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
              <div className="bg-red-50 p-4 rounded-2xl rounded-tl-none">
                <Loader2 className="w-5 h-5 animate-spin text-[#FF3008]" />
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
