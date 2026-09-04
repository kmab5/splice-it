import React, { useState } from 'react';
import { ExportFormat, ExportOptions, ExportResult, ProjectState } from '../types/project';
import { exportProject, isTauri, pickSavePath } from '../services/ipc';
import { X, Download, ShieldCheck, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  project: ProjectState;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; title: string; blurb: string }[] = [
  {
    id: 'wav_24',
    title: 'WAV 24-bit PCM',
    blurb: 'Industry standard for mastering and delivery',
  },
  {
    id: 'wav_16',
    title: 'WAV 16-bit PCM',
    blurb: 'CD standard, smallest uncompressed file',
  },
  {
    id: 'wav_32f',
    title: 'WAV 32-bit Float',
    blurb: 'Full headroom, no clipping on render',
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, project, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('wav_24');
  const [normalizeLufs, setNormalizeLufs] = useState(true);
  const [dither, setDither] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  if (!isOpen) return null;

  const clipCount = project.clips.length;
  const canExport = clipCount > 0 && !isExporting;
  // Dither only means anything when truncating to a fixed-point format.
  const ditherApplies = format !== 'wav_32f';

  const handleStartExport = async () => {
    setResult(null);
    setIsSuccess(null);

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Splice_It_Mixdown';
    let exportPath = `${safeName}_Master.wav`;

    // Ask the user where the file goes. The previous build wrote to a relative
    // "./exports" folder, which on a packaged Windows app resolves inside
    // Program Files and fails.
    if (isTauri()) {
      const chosen = await pickSavePath(exportPath, ['wav'], 'Export mixdown');
      if (!chosen) return;
      exportPath = chosen;
    }

    setIsExporting(true);
    setStatusMessage('Decoding sources, compositing tracks, and rendering the master chain...');

    const options: ExportOptions = {
      export_path: exportPath,
      format,
      normalize_to_target_lufs: normalizeLufs,
      dither: dither && ditherApplies,
    };

    const res = await exportProject(project, options);

    setIsExporting(false);
    setIsSuccess(res.success);
    setStatusMessage(res.message);
    setResult(res.result ?? null);
  };

  return (
    <div
      id="export-modal-backdrop"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
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
                Renders {clipCount} clip{clipCount === 1 ? '' : 's'} through the DSP chain and embeds tags
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`p-2.5 rounded border text-left transition flex flex-col justify-between ${
                    format === f.id
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="font-bold">{f.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{f.blurb}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              FLAC and MP3 export are planned for a later milestone.
            </p>
          </div>

          {/* Render options */}
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
                  Match {project.master_dsp.target_lufs.toFixed(1)} LUFS
                </span>
              </label>
              <span className="text-[10px] text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50">
                Streaming Standard
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <label
                className={`flex items-center space-x-2 ${
                  ditherApplies ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={dither && ditherApplies}
                  disabled={!ditherApplies}
                  onChange={(e) => setDither(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 accent-emerald-500"
                />
                <span className="text-slate-300">
                  Apply TPDF dithering
                  {!ditherApplies && ' (not used for float output)'}
                </span>
              </label>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Embedded Metadata Summary */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Metadata to be Embedded
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
                {project.metadata.cover_art_base64 ? 'Embedded' : 'None'}
              </div>
            </div>
          </div>

          {/* Status feedback */}
          {statusMessage && (
            <div
              className={`p-3 rounded-md flex items-start space-x-2 text-xs ${
                isSuccess === true
                  ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                  : isSuccess === false
                  ? 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
                  : 'bg-slate-800/80 border border-slate-700 text-slate-300'
              }`}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0 mt-0.5" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="break-words">{statusMessage}</div>
                {result && (
                  <div className="font-mono text-[10px] text-slate-400 space-y-0.5">
                    <div className="flex items-center gap-1 break-all">
                      <FolderOpen className="w-3 h-3 shrink-0" />
                      {result.path}
                    </div>
                    <div>
                      {result.measured_lufs.toFixed(1)} LUFS &middot; peak{' '}
                      {result.peak_db.toFixed(1)} dBFS
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {clipCount === 0 && (
            <div className="p-3 rounded-md bg-slate-800/60 border border-slate-700 text-slate-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Add at least one clip to the timeline before exporting.</span>
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
            Close
          </button>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={!canExport}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rendering...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Choose Location & Export</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
