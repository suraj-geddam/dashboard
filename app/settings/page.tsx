'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [config, setConfig] = useState({
    llm_provider: 'local',
    llm_base_url: '',
    llm_api_key: '',
    llm_model: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig({
          llm_provider: data.llm_provider || 'local',
          llm_base_url: data.llm_base_url || '',
          llm_api_key: data.llm_api_key || '',
          llm_model: data.llm_model || ''
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500 mt-2">Configure your AI Analytics Engine.</p>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">LLM Provider</label>
          <div className="flex gap-4">
            <button
              onClick={() => setConfig({ ...config, llm_provider: 'local' })}
              className={`px-4 py-2 rounded-lg border ${config.llm_provider === 'local' ? 'bg-red-50 border-[#FF3008] text-[#FF3008]' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              Local (Llama.cpp)
            </button>
            <button
              onClick={() => setConfig({ ...config, llm_provider: 'hosted' })}
              className={`px-4 py-2 rounded-lg border ${config.llm_provider === 'hosted' ? 'bg-red-50 border-[#FF3008] text-[#FF3008]' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              Hosted (OpenRouter)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
          <input
            type="text"
            value={config.llm_base_url}
            onChange={(e) => setConfig({ ...config, llm_base_url: e.target.value })}
            placeholder={config.llm_provider === 'local' ? 'http://localhost:8080/v1' : 'https://openrouter.ai/api/v1'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF3008] focus:border-transparent outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            {config.llm_provider === 'local' ? 'URL of your local llama-server (e.g., http://localhost:8080/v1)' : 'OpenRouter API URL'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
          <input
            type="password"
            value={config.llm_api_key}
            onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
            placeholder={config.llm_provider === 'local' ? 'Not required for local' : 'sk-or-v1-...'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF3008] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Model Name</label>
          <input
            type="text"
            value={config.llm_model}
            onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
            placeholder={config.llm_provider === 'local' ? 'llama-3.2-3b-instruct' : 'meta-llama/llama-3.2-3b-instruct'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF3008] focus:border-transparent outline-none"
          />
        </div>

        <div className="pt-4 flex items-center justify-end gap-4">
          {success && (
            <span className="text-green-600 flex items-center gap-2 text-sm font-medium animate-fade-in">
              <CheckCircle size={16} /> Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#FF3008] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#E02906] disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
