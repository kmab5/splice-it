import React, { useState } from 'react';
import { ProjectState, ExportOptions } from '../types/project';
import { exportProject } from '../services/ipc';
import { X, Download, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  project: ProjectState;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, project, onClose }) => {
  const [format, setFormat] = useState<'wav_24' | 'wav_32f' | 'flac' | 'mp3'>('wav_24');
  const [normalizeLufs, setNormalizeLufs] = useState(true);
  const [dither, setDither] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setStatusMessage('Compositing tracks, baking DSP mastering chain, and rendering audio...');
    setIsSuccess(null);

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const exportPath = `./exports/${safeName}_Master.${format.startsWith('wav') ? 'wav' : format}`;

    const res = await exportProject(project, exportPath);

    setIsExporting(false);
    setIsSuccess(res.success);
    setStatusMessage(res.message);
  };

  return (
    <div
      id="export-modal-backdrop"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        id="export-modal-container"
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Export Master Mixdown</h3>
              <p className="text-[11px] text-slate-400">
                Render timeline with sample-accurate DSP chain and metadata
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs text-slate-200">
          {/* Format Selection */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
              Audio Format & Bit Depth
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('wav_24')}
                className={`p-2.5 rounded border text-left transition flex flex-col justify-between ${
                  format === 'wav_24'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-bold">WAV 24-bit PCM</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Industry standard for mastering & streaming
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('wav_32f')}
                className={`p-2.5 rounded border text-left transition flex flex-col justify-between ${
                  format === 'wav_32f'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-bold">WAV 32-bit Float</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Unlimited dynamic headroom, 0 clipping
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('flac')}
                className={`p-2.5 rounded border text-left transition flex flex-col justify-between ${
                  format === 'flac'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-bold">FLAC (Lossless)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Compressed lossless audio archive
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('mp3')}
                className={`p-2.5 rounded border text-left transition flex flex-col justify-between ${
                  format === 'mp3'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-bold">MP3 320 kbps</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Portable reference with embedded ID3
                </div>
              </button>
            </div>
          </div>

          {/* DSP Mastering Chain Checkbox */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeLufs}
                  onChange={(e) => setNormalizeLufs(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 accent-emerald-500"
                />
                <span className="font-medium text-slate-200">
                  Target -14.0 LUFS Loudness Match
                </span>
              </label>
              <span className="text-[10px] text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50">
                YouTube / Spotify Standard
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dither}
                  onChange={(e) => setDither(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 accent-emerald-500"
                />
                <span className="text-slate-300">Apply TPDF Dithering (24-bit truncation)</span>
              </label>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Embedded Metadata Summary */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Metadata to be Baked
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300">
              <div>
                <span className="text-slate-500">Title:</span> {project.metadata.title || project.name}
              </div>
              <div>
                <span className="text-slate-500">Artist:</span>{' '}
                {project.metadata.artist || 'Unassigned'}
              </div>
              <div>
                <span className="text-slate-500">ISRC:</span> {project.metadata.isrc || 'None'}
              </div>
              <div>
                <span className="text-slate-500">Cover:</span>{' '}
                {project.metadata.cover_art_base64 ? 'Embedded (JPEG)' : 'None'}
              </div>
            </div>
          </div>

          {/* Status feedback */}
          {statusMessage && (
            <div
              className={`p-3 rounded-md flex items-center space-x-2 text-xs ${
                isSuccess === true
                  ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                  : isSuccess === false
                  ? 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
                  : 'bg-slate-800/80 border border-slate-700 text-slate-300'
              }`}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rendering...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export Mixdown</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
