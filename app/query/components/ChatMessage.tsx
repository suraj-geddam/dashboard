import { User, Bot, ChevronDown, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/lib/types';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message: msg }: ChatMessageProps) {
  return (
    <div className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
            <pre className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200 overflow-x-auto overflow-y-auto max-h-60">
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
                      {Object.values(row).map((val: unknown, j) => (
                        <td key={j} className="px-4 py-2 whitespace-nowrap text-gray-600">
                          {val == null ? '—' : (typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(2) : String(val))}
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
  );
}
