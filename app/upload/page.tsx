'use client';

import { useState } from 'react';
import { Upload as UploadIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{ count: number } | null>(null);

  // Enrichment states
  const [enrichmentStatus, setEnrichmentStatus] = useState<'idle' | 'enriching' | 'complete' | 'error'>('idle');
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0, enriched: 0 });
  const [enrichmentMessage, setEnrichmentMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setStatus('success');
      setStats({ count: data.count });
      setMessage(`Successfully processed ${data.count} orders.`);
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message);
    }
  };

  const startEnrichment = () => {
    setEnrichmentStatus('enriching');
    setEnrichmentMessage('Connecting to enrichment service...');

    const eventSource = new EventSource('/api/enrich');

    eventSource.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case 'start':
          setEnrichmentProgress({ current: 0, total: data.total, enriched: 0 });
          setEnrichmentMessage(`Enriching ${data.total} stores...`);
          break;

        case 'progress':
          setEnrichmentProgress({
            current: data.current,
            total: data.total,
            enriched: data.enriched || 0
          });
          setEnrichmentMessage(data.status || `Processing ${data.current}/${data.total}...`);
          break;

        case 'error':
          setEnrichmentStatus('error');
          setEnrichmentMessage(`Error: ${data.message}`);
          eventSource.close();
          break;

        case 'complete':
          setEnrichmentStatus('complete');
          setEnrichmentMessage(`Successfully enriched ${data.enriched} stores!`);
          eventSource.close();
          break;
      }
    });

    eventSource.addEventListener('error', () => {
      setEnrichmentStatus('error');
      setEnrichmentMessage('Connection to enrichment service lost');
      eventSource.close();
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Upload Data</h2>
        <p className="text-gray-500 mt-2">Upload your DoorDash <code className="bg-gray-100 px-1 py-0.5 rounded">consumer_order_details.csv</code> file to get started.</p>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <UploadIcon className="w-8 h-8 text-[#FF3008]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {file ? file.name : 'Click to upload or drag and drop'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">CSV files only</p>
        </div>

        {status === 'uploading' && (
          <div className="mt-6 flex items-center justify-center text-gray-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing your data...</span>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="mt-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Upload Complete!</p>
                <p className="text-sm">{message}</p>
              </div>
            </div>

            {enrichmentStatus === 'idle' && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={startEnrichment}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  Enrich Metadata
                </button>
              </div>
            )}

            {enrichmentStatus === 'enriching' && (
              <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">Enriching Store Metadata</span>
                </div>
                <p className="text-sm mb-2">{enrichmentMessage}</p>
                {enrichmentProgress.total > 0 && (
                  <>
                    <div className="w-full bg-blue-200 rounded-full h-2 mb-1 progress-bar">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(enrichmentProgress.current / enrichmentProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs">
                      {enrichmentProgress.current}/{enrichmentProgress.total} stores processed
                      ({enrichmentProgress.enriched} enriched)
                    </p>
                  </>
                )}
              </div>
            )}

            {enrichmentStatus === 'complete' && (
              <div className="mt-4 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Enrichment Complete!</p>
                  <p className="text-sm">{enrichmentMessage}</p>
                </div>
              </div>
            )}

            {enrichmentStatus === 'error' && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Enrichment Failed</p>
                  <p className="text-sm">{enrichmentMessage}</p>
                </div>
              </div>
            )}
          </>
        )}

        {status === 'error' && (
          <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Upload Failed</p>
              <p className="text-sm">{message}</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleUpload}
            disabled={!file || status === 'uploading'}
            className="bg-[#FF3008] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#E02906] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Upload Data
          </button>
        </div>
      </div>
    </div>
  );
}
