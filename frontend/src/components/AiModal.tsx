'use client';
import ReactMarkdown from 'react-markdown';

interface Props {
  isAnalyzing: boolean;
  analysisText: string;
  analysisError: string;
  onClose: () => void;
}

export function AiModal({ isAnalyzing, analysisText, analysisError, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-none w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#D3D5D9]" style={{ backgroundColor: '#F9F9F9' }}>
          <strong className="text-sm font-bold uppercase tracking-wide" style={{ color: '#002855' }}>AI Diagnostics Analysis</strong>
          <button
            onClick={onClose}
            title="Close the analysis panel"
            className="text-[#757575] text-xl leading-none hover:text-[#273139]"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1 prose prose-sm max-w-none">
          {isAnalyzing && (
            <p className="text-[#757575]">
              Analyzing telemetry with Claude... this may take 10&ndash;20 seconds.
            </p>
          )}
          {!isAnalyzing && analysisError && (
            <div className="border p-3 text-sm" style={{ backgroundColor: '#fff0f0', borderColor: '#D0021B', color: '#D0021B' }}>
              {analysisError}
            </div>
          )}
          {!isAnalyzing && analysisText && <ReactMarkdown>{analysisText}</ReactMarkdown>}
        </div>
      </div>
    </div>
  );
}
