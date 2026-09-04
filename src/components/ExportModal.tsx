import React, { useState } from 'react';
import {
  ExportFormat,
  ExportOptions,
  ExportResult,
  MetadataDto,
  formatExtension,
  formatUsesDither,
} from '../types/project';
import { isTauri, pickSavePath } from '../services/ipc';
import { X, Download, ShieldCheck, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Filename without extension, offered in the save dialog. */
  defaultFileName: string;
  /** How many clips or files will be rendered. */
  itemCount: number;
  /** Singular noun for the count, e.g. 'clip' or 'file'. */
  itemNoun: string;
  metadata: MetadataDto;
  /** When supplied, the tag summary becomes editable in place. */
  onUpdateMetadata?: (updates: Partial<MetadataDto>) => void;
  targetLufs: number;
  /** Performs the actual render. Supplied by whichever mode opened the modal. */
  onExport: (
    options: ExportOptions
  ) => Promise<{ success: boolean; message: string; result?: ExportResult }>;
}

const FORMATS: { id: ExportFormat; title: string; blurb: string; lossless: boolean }[] = [
  {
    id: 'wav_24',
    title: 'WAV 24-bit',
    blurb: 'Standard for mastering and delivery',
    lossless: true,
  },
  {
    id: 'wav_16',
    title: 'WAV 16-bit',
    blurb: 'CD standard, smallest uncompressed',
    lossless: true,
  },
  {
    id: 'wav_32f',
    title: 'WAV 32-bit Float',
    blurb: 'Full headroom, no clipping',
    lossless: true,
  },
  {
    id: 'flac',
    title: 'FLAC',
    blurb: 'Lossless, roughly half the size of WAV',
    lossless: true,
  },
  {
    id: 'mp3',
    title: 'MP3',
    blurb: 'Lossy, plays everywhere',
    lossless: false,
  },
];

const MP3_BITRATES = [128, 160, 192, 256, 320];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  defaultFileName,
  itemCount,
  itemNoun,
  metadata,
  onUpdateMetadata,
  targetLufs,
  onExport,
}) => {
  const [format, setFormat] = useState<ExportFormat>('wav_24');
  const [normalizeLufs, setNormalizeLufs] = useState(true);
  const [dither, setDither] = useState(true);
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [flacBitDepth, setFlacBitDepth] = useState(24);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  if (!isOpen) return null;

  const clipCount = itemCount;
  const canExport = clipCount > 0 && !isExporting;
  // Dither only means anything when truncating to a fixed-point format.
  const ditherApplies = formatUsesDither(format) && !(format === 'flac' && flacBitDepth === 24);
  const extension = formatExtension(format);

  const handleStartExport = async () => {
    setResult(null);
    setIsSuccess(null);

    const safeName = defaultFileName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Splice_It_Output';
    let exportPath = `${safeName}.${extension}`;

    // Ask the user where the file goes. The previous build wrote to a relative
    // "./exports" folder, which on a packaged Windows app resolves inside
    // Program Files and fails.
    if (isTauri()) {
      const chosen = await pickSavePath(exportPath, [extension], 'Export mixdown');
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
      mp3_bitrate_kbps: mp3Bitrate,
      flac_bit_depth: flacBitDepth,
    };

    const res = await onExport(options);

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
                Renders {clipCount} {itemNoun}
                {clipCount === 1 ? '' : 's'} and embeds the tags below
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold">{f.title}</span>
                    {!f.lossless && (
                      <span className="text-[9px] text-amber-400/90 font-mono">lossy</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{f.blurb}</div>
                </button>
              ))}
            </div>

            {/* Per-format options */}
            {format === 'mp3' && (
              <div className="mt-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Bitrate
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">{mp3Bitrate} kbps</span>
                </div>
                <div className="flex gap-1.5">
                  {MP3_BITRATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setMp3Bitrate(rate)}
                      className={`flex-1 py-1 rounded text-[11px] font-mono border transition ${
                        mp3Bitrate === rate
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {rate}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  MP3 supports up to 48 kHz. A 96 kHz project will be refused — export WAV or
                  FLAC instead.
                </p>
              </div>
            )}

            {format === 'flac' && (
              <div className="mt-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Bit Depth
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">{flacBitDepth}-bit</span>
                </div>
                <div className="flex gap-1.5">
                  {[16, 24].map((depth) => (
                    <button
                      key={depth}
                      type="button"
                      onClick={() => setFlacBitDepth(depth)}
                      className={`flex-1 py-1 rounded text-[11px] font-mono border transition ${
                        flacBitDepth === depth
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {depth}-bit
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-500 mt-1.5">
              Saving as <span className="font-mono text-slate-400">.{extension}</span> — tags are
              embedded in every format.
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
                  Match {targetLufs.toFixed(1)} LUFS
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
                  {!ditherApplies &&
                    (format === 'mp3'
                      ? ' (not used for MP3)'
                      : format === 'flac'
                      ? ' (not needed at 24-bit)'
                      : ' (not used for float output)')}
                </span>
              </label>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Metadata — editable here so tags can be set without leaving the dialog */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Metadata to be Embedded
              </span>
              {onUpdateMetadata && (
                <span className="text-[10px] text-slate-500">editable</span>
              )}
            </div>

            {onUpdateMetadata ? (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'title', label: 'Title', placeholder: defaultFileName },
                    { key: 'artist', label: 'Artist', placeholder: 'Artist' },
                    { key: 'album', label: 'Album', placeholder: 'Album' },
                    { key: 'genre', label: 'Genre', placeholder: 'Genre' },
                  ] as const
                ).map((field) => (
                  <div key={field.key}>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={(metadata[field.key] as string) || ''}
                      placeholder={field.placeholder}
                      onChange={(e) => onUpdateMetadata({ [field.key]: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">
                    Year
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={metadata.year || ''}
                    placeholder="2026"
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      onUpdateMetadata({
                        year: e.target.value.trim() === '' || !Number.isFinite(n) || n <= 0
                          ? undefined
                          : Math.min(n, 9999),
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">
                    ISRC
                  </label>
                  <input
                    type="text"
                    value={metadata.isrc || ''}
                    placeholder="US-XXX-00-00000"
                    onChange={(e) => onUpdateMetadata({ isrc: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="col-span-2 text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                  Cover art: {metadata.cover_art_base64 ? 'embedded' : 'none'} — set it in the Tags
                  panel.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300">
                <div>
                  <span className="text-slate-500">Title:</span> {metadata.title || defaultFileName}
                </div>
                <div>
                  <span className="text-slate-500">Artist:</span> {metadata.artist || 'Unassigned'}
                </div>
              </div>
            )}
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
              <span>Add at least one {itemNoun} before exporting.</span>
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
