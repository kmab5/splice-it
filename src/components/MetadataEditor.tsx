import React, { useRef } from 'react';
import { MetadataDto } from '../types/project';
import { Tag, Image as ImageIcon, Trash2, Upload, FileText, Music2 } from 'lucide-react';

interface MetadataEditorProps {
  metadata: MetadataDto;
  onUpdateMetadata: (updates: Partial<MetadataDto>) => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  metadata,
  onUpdateMetadata,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Split data URL: "data:image/jpeg;base64,..."
        const base64 = result.split(',')[1];
        onUpdateMetadata({
          cover_art_base64: base64,
          cover_art_mime: file.type || 'image/jpeg',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Tag counts are unsigned integers in the file format. Without this the
   * number spinner walked negative from an empty field and the export failed
   * with: invalid value: integer `-6`, expected u32.
   */
  const parseCount = (raw: string, max: number): number | undefined => {
    if (raw.trim() === '') return undefined;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(n, max);
  };

  const clearCoverArt = () => {
    onUpdateMetadata({ cover_art_base64: undefined, cover_art_mime: undefined });
  };

  return (
    <div
      id="metadata-editor"
      className="h-full bg-slate-900/95 p-4 overflow-y-auto text-slate-200 select-none"
    >
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
        {/* Left Column: Artwork Drop Zone & Summary */}
        <div className="w-full md:w-56 shrink-0 flex flex-col items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-48 h-48 rounded-lg border-2 border-dashed border-slate-700 hover:border-cyan-500 bg-slate-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition group relative shadow-md"
            title="Click or drop cover artwork here"
          >
            {metadata.cover_art_base64 ? (
              <>
                <img
                  src={`data:${metadata.cover_art_mime || 'image/jpeg'};base64,${metadata.cover_art_base64}`}
                  alt="Cover Artwork"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition">
                  <Upload className="w-5 h-5 text-cyan-400 mb-1" />
                  <span className="text-[11px] text-slate-200">Replace Artwork</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center text-center p-3">
                <ImageIcon className="w-10 h-10 text-slate-600 mb-2 group-hover:text-cyan-400 transition" />
                <span className="text-xs font-semibold text-slate-400">Cover Artwork</span>
                <span className="text-[10px] text-slate-600 mt-1">
                  Drop PNG / JPEG (max 3000x3000px)
                </span>
              </div>
            )}
          </div>

          {metadata.cover_art_base64 && (
            <button
              onClick={clearCoverArt}
              className="mt-2 text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 py-1 px-2 rounded hover:bg-slate-800 transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove Artwork</span>
            </button>
          )}

          <div className="mt-4 text-[11px] text-slate-500 text-center font-mono">
            Directly embedded via Lofty crate during WAV / FLAC / MP3 export.
          </div>
        </div>

        {/* Center & Right Column: Standard and Extended Tags Form */}
        <div className="flex-1 space-y-4">
          {/* Section 1: Standard ID3 Tags */}
          <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
            <div className="flex items-center space-x-2 mb-3">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Standard Audio Metadata
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Track Title
                </label>
                <input
                  type="text"
                  value={metadata.title || ''}
                  onChange={(e) => onUpdateMetadata({ title: e.target.value })}
                  placeholder="e.g. Neon Skyline"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Artist / Performer
                </label>
                <input
                  type="text"
                  value={metadata.artist || ''}
                  onChange={(e) => onUpdateMetadata({ artist: e.target.value })}
                  placeholder="e.g. Aether Wave"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Album Name
                </label>
                <input
                  type="text"
                  value={metadata.album || ''}
                  onChange={(e) => onUpdateMetadata({ album: e.target.value })}
                  placeholder="e.g. Parallel Horizons"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Release Year
                </label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  value={metadata.year || ''}
                  onChange={(e) => onUpdateMetadata({ year: parseCount(e.target.value, 9999) })}
                  placeholder="2026"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Genre
                </label>
                <input
                  type="text"
                  value={metadata.genre || ''}
                  onChange={(e) => onUpdateMetadata({ genre: e.target.value })}
                  placeholder="Electronic / Synthwave"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Composer
                </label>
                <input
                  type="text"
                  value={metadata.composer || ''}
                  onChange={(e) => onUpdateMetadata({ composer: e.target.value })}
                  placeholder="Composer names"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Track / Total
                </label>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    value={metadata.track_number || ''}
                    onChange={(e) =>
                      onUpdateMetadata({ track_number: parseCount(e.target.value, 9999) })
                    }
                    placeholder="1"
                    className="w-1/2 bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-center"
                  />
                  <span className="text-slate-500 font-mono">/</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    value={metadata.total_tracks || ''}
                    onChange={(e) =>
                      onUpdateMetadata({ total_tracks: parseCount(e.target.value, 9999) })
                    }
                    placeholder="10"
                    className="w-1/2 bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-center"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Comment
                </label>
                <input
                  type="text"
                  value={metadata.comment || ''}
                  onChange={(e) => onUpdateMetadata({ comment: e.target.value })}
                  placeholder="Mastered in Splice It"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Extended Professional Tags */}
          <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
            <div className="flex items-center space-x-2 mb-3">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Extended Tags (ISRC, BPM, Key & Publisher)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  ISRC Code
                </label>
                <input
                  type="text"
                  value={metadata.isrc || ''}
                  onChange={(e) => onUpdateMetadata({ isrc: e.target.value })}
                  placeholder="US-SP1-26-00101"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  BPM (Tempo)
                </label>
                <input
                  type="number"
                  value={metadata.bpm || ''}
                  min={0}
                  max={999}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onUpdateMetadata({
                      bpm: e.target.value.trim() === '' || !Number.isFinite(n) || n <= 0 ? undefined : n,
                    });
                  }}
                  placeholder="120"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Musical Key
                </label>
                <input
                  type="text"
                  value={metadata.key || ''}
                  onChange={(e) => onUpdateMetadata({ key: e.target.value })}
                  placeholder="A minor"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Encoder
                </label>
                <input
                  type="text"
                  value={metadata.encoder || ''}
                  onChange={(e) => onUpdateMetadata({ encoder: e.target.value })}
                  placeholder="Splice It Rust Engine"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Copyright Notice
                </label>
                <input
                  type="text"
                  value={metadata.copyright || ''}
                  onChange={(e) => onUpdateMetadata({ copyright: e.target.value })}
                  placeholder="© 2026 Splice It Records"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Publisher / Label
                </label>
                <input
                  type="text"
                  value={metadata.publisher || ''}
                  onChange={(e) => onUpdateMetadata({ publisher: e.target.value })}
                  placeholder="Splice It Music Group"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
