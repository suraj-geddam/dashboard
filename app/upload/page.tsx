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
          <div className="mt-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Upload Complete!</p>
              <p className="text-sm">{message}</p>
            </div>
          </div>
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
