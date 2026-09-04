import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Play,
  Pause,
  Square,
  ChevronUp,
  ChevronDown,
  Download,
  Copy,
  Tag,
  ListOrdered,
  Loader2,
  Scissors,
  ArrowDownUp,
  Sliders,
} from 'lucide-react';
import { ConcatItem, ConcatState, MetadataDto } from '../types/project';
import { MetadataEditor } from './MetadataEditor';
import { linearToDb, dbToLinear } from '../services/dspMath';

interface ConcatWorkspaceProps {
  state: ConcatState;
  onChange: (updater: (prev: ConcatState) => ConcatState) => void;
  onImportRequest: () => Promise<boolean>;
  isImporting: boolean;
  /** Sources present in the audio pool that can be added without re-importing. */
  poolItems: { name: string; path: string; duration_ms: number }[];
  isPlaying: boolean;
  currentTimeMs: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (ms: number) => void;
  onOpenExport: () => void;
}

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00.0';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const t = Math.floor((totalSec % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
};

/**
 * Running start offset of every item, accounting for gaps and crossfade
 * overlaps. This is the same layout the Rust exporter computes, so the
 * timings shown here match the rendered file.
 */
export function computeLayout(items: ConcatItem[]): { starts: number[]; totalMs: number } {
  const starts: number[] = [];
  let cursor = 0;

  items.forEach((item, i) => {
    starts.push(cursor);
    const isLast = i === items.length - 1;
    let crossfade = isLast ? 0 : item.crossfade_ms;
    if (crossfade > 0) {
      const next = items[i + 1];
      crossfade = Math.min(crossfade, item.duration_ms, next ? next.duration_ms : 0);
    }
    const gap = crossfade > 0 ? 0 : item.gap_after_ms;
    cursor += Math.max(0, item.duration_ms - crossfade) + gap;
  });

  const totalMs = items.reduce(
    (max, item, i) => Math.max(max, starts[i] + item.duration_ms),
    0
  );

  return { starts, totalMs };
}

export const ConcatWorkspace: React.FC<ConcatWorkspaceProps> = ({
  state,
  onChange,
  onImportRequest,
  isImporting,
  poolItems,
  isPlaying,
  currentTimeMs,
  onPlayPause,
  onStop,
  onSeek,
  onOpenExport,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [showPool, setShowPool] = useState(false);

  const { starts, totalMs } = useMemo(() => computeLayout(state.items), [state.items]);

  const setItems = useCallback(
    (fn: (items: ConcatItem[]) => ConcatItem[]) => {
      onChange((prev) => ({ ...prev, items: fn(prev.items) }));
    },
    [onChange]
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<ConcatItem>) => {
      setItems((items) => items.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    },
    [setItems]
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((items) => items.filter((i) => i.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [setItems]
  );

  const duplicateItem = useCallback(
    (id: string) => {
      setItems((items) => {
        const idx = items.findIndex((i) => i.id === id);
        if (idx === -1) return items;
        const copy: ConcatItem = {
          ...items[idx],
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
        const next = [...items];
        next.splice(idx + 1, 0, copy);
        return next;
      });
    },
    [setItems]
  );

  const moveItem = useCallback(
    (from: number, to: number) => {
      setItems((items) => {
        if (to < 0 || to >= items.length || from === to) return items;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
    [setItems]
  );

  const addFromPool = useCallback(
    (source: { name: string; path: string; duration_ms: number }) => {
      setItems((items) => [
        ...items,
        {
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: source.name,
          source_path: source.path,
          gain: 1.0,
          gap_after_ms: 0,
          crossfade_ms: 0,
          duration_ms: source.duration_ms,
        },
      ]);
    },
    [setItems]
  );

  /** Apply one gap or crossfade value to every junction at once. */
  const applyToAll = useCallback(
    (field: 'gap_after_ms' | 'crossfade_ms', value: number) => {
      setItems((items) =>
        items.map((i) => ({
          ...i,
          [field]: value,
          // The two are mutually exclusive at a junction.
          [field === 'gap_after_ms' ? 'crossfade_ms' : 'gap_after_ms']: 0,
        }))
      );
    },
    [setItems]
  );

  const handleDrop = (targetIndex: number) => {
    if (dragIndex !== null) moveItem(dragIndex, targetIndex);
    setDragIndex(null);
    setDropIndex(null);
  };

  const selected = state.items.find((i) => i.id === selectedId) || null;
  const progressPct = totalMs > 0 ? Math.min(100, (currentTimeMs / totalMs) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 overflow-hidden">
      {/* Transport + summary bar */}
      <div className="h-14 border-b border-slate-800 bg-[#0F172A] flex items-center gap-3 px-4 shrink-0">
        <button
          onClick={onPlayPause}
          disabled={state.items.length === 0}
          title={isPlaying ? 'Pause preview' : 'Preview the joined result'}
          className="p-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>
        <button
          onClick={onStop}
          disabled={state.items.length === 0}
          title="Stop"
          className="p-1.5 text-slate-400 hover:text-white transition disabled:opacity-30"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>

        <span className="font-mono text-cyan-400 text-sm font-semibold tabular-nums">
          {formatDuration(currentTimeMs)}
        </span>

        {/* Scrub bar */}
        <div
          className="flex-1 h-2 bg-slate-800/80 rounded-full relative cursor-pointer group min-w-0"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onSeek(((e.clientX - rect.left) / rect.width) * totalMs);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
          {/* Item boundary ticks */}
          {state.items.map((item, i) =>
            i === 0 ? null : (
              <div
                key={item.id}
                className="absolute top-0 bottom-0 w-px bg-slate-600 group-hover:bg-slate-500"
                style={{ left: `${totalMs > 0 ? (starts[i] / totalMs) * 100 : 0}%` }}
              />
            )
          )}
        </div>

        <span className="font-mono text-slate-400 text-xs tabular-nums shrink-0">
          {formatDuration(totalMs)}
        </span>

        <div className="h-5 w-px bg-slate-800 shrink-0" />

        <button
          onClick={() => setShowTags((v) => !v)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition shrink-0 ${
            showTags
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Tags</span>
        </button>

        <button
          onClick={onOpenExport}
          disabled={state.items.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ---------------- Main list ---------------- */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => void onImportRequest()}
              disabled={isImporting}
              className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{isImporting ? 'Analyzing...' : 'Add Files'}</span>
            </button>

            {poolItems.length > 0 && (
              <button
                onClick={() => setShowPool((v) => !v)}
                className="px-3 py-1.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>From Pool ({poolItems.length})</span>
              </button>
            )}

            <div className="h-5 w-px bg-slate-800" />

            <button
              onClick={() =>
                setItems((items) => [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
              }
              disabled={state.items.length < 2}
              title="Sort by filename, numerically aware (track2 before track10)"
              className="px-2.5 py-1.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sort by Name</span>
            </button>

            <button
              onClick={() => setItems((items) => [...items].reverse())}
              disabled={state.items.length < 2}
              className="px-2.5 py-1.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs transition disabled:opacity-40"
            >
              Reverse
            </button>

            <div className="flex-1" />

            {/* Bulk junction controls */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="hidden lg:inline">All gaps</span>
              <select
                onChange={(e) => applyToAll('gap_after_ms', Number(e.target.value))}
                value=""
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-300 text-[11px] focus:outline-none focus:border-cyan-500"
              >
                <option value="">Gap…</option>
                <option value="0">None</option>
                <option value="250">0.25s</option>
                <option value="500">0.5s</option>
                <option value="1000">1s</option>
                <option value="2000">2s</option>
              </select>
              <select
                onChange={(e) => applyToAll('crossfade_ms', Number(e.target.value))}
                value=""
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-300 text-[11px] focus:outline-none focus:border-cyan-500"
              >
                <option value="">Crossfade…</option>
                <option value="0">None</option>
                <option value="50">50ms</option>
                <option value="250">0.25s</option>
                <option value="500">0.5s</option>
                <option value="1000">1s</option>
              </select>
            </div>
          </div>

          {/* Pool picker */}
          {showPool && poolItems.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 shrink-0 max-h-28 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {poolItems.map((source) => (
                  <button
                    key={source.path}
                    onClick={() => addFromPool(source)}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-cyan-900/50 border border-slate-700 hover:border-cyan-600 rounded text-[11px] text-slate-300 hover:text-cyan-200 transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span className="max-w-[180px] truncate">{source.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The ordered list */}
          <div className="flex-1 overflow-y-auto p-4">
            {state.items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                <ListOrdered className="w-12 h-12 mb-3 opacity-25 text-cyan-400" />
                <p className="text-sm font-medium text-slate-400">No files in the list</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Add audio files, drag them into the order you want, and export a single
                  joined file.
                </p>
                <button
                  onClick={() => void onImportRequest()}
                  className="mt-4 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Files
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-w-4xl">
                {state.items.map((item, index) => {
                  const isSelected = item.id === selectedId;
                  const isDropTarget = dropIndex === index && dragIndex !== index;
                  const isLast = index === state.items.length - 1;

                  return (
                    <div key={item.id}>
                      <div
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDropIndex(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropIndex(index);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDrop(index);
                        }}
                        onClick={() => setSelectedId(isSelected ? null : item.id)}
                        className={`group rounded-lg border px-3 py-2.5 flex items-center gap-3 cursor-pointer transition ${
                          isSelected
                            ? 'bg-cyan-950/30 border-cyan-500/60'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        } ${isDropTarget ? 'ring-2 ring-cyan-400/70' : ''} ${
                          dragIndex === index ? 'opacity-40' : ''
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 cursor-grab active:cursor-grabbing" />

                        <span className="font-mono text-[11px] text-slate-500 w-6 shrink-0 text-right">
                          {index + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-slate-200 truncate" title={item.source_path}>
                            {item.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>starts {formatDuration(starts[index])}</span>
                            <span className="text-slate-700">|</span>
                            <span>{formatDuration(item.duration_ms)}</span>
                            {item.gain !== 1 && (
                              <>
                                <span className="text-slate-700">|</span>
                                <span className="text-amber-400">
                                  {linearToDb(item.gain) > 0 ? '+' : ''}
                                  {linearToDb(item.gain).toFixed(1)} dB
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveItem(index, index - 1);
                            }}
                            disabled={index === 0}
                            title="Move up"
                            className="p-1 text-slate-500 hover:text-cyan-300 disabled:opacity-20 rounded transition"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveItem(index, index + 1);
                            }}
                            disabled={isLast}
                            title="Move down"
                            className="p-1 text-slate-500 hover:text-cyan-300 disabled:opacity-20 rounded transition"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateItem(item.id);
                            }}
                            title="Duplicate"
                            className="p-1 text-slate-500 hover:text-slate-200 rounded transition opacity-0 group-hover:opacity-100"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                            }}
                            title="Remove from list"
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Junction control between this item and the next */}
                      {!isLast && (
                        <div className="flex items-center gap-2 pl-10 py-1 text-[10px] text-slate-500">
                          <Scissors className="w-3 h-3 text-slate-700 rotate-90" />
                          {item.crossfade_ms > 0 ? (
                            <span className="text-cyan-400 font-mono">
                              crossfade {(item.crossfade_ms / 1000).toFixed(2)}s
                            </span>
                          ) : item.gap_after_ms > 0 ? (
                            <span className="text-amber-400 font-mono">
                              gap {(item.gap_after_ms / 1000).toFixed(2)}s
                            </span>
                          ) : (
                            <span className="text-slate-600 font-mono">butt join</span>
                          )}
                          <button
                            onClick={() =>
                              updateItem(item.id, {
                                gap_after_ms: item.gap_after_ms > 0 ? 0 : 500,
                                crossfade_ms: 0,
                              })
                            }
                            className="hover:text-amber-300 underline decoration-dotted transition"
                          >
                            gap
                          </button>
                          <button
                            onClick={() =>
                              updateItem(item.id, {
                                crossfade_ms: item.crossfade_ms > 0 ? 0 : 500,
                                gap_after_ms: 0,
                              })
                            }
                            className="hover:text-cyan-300 underline decoration-dotted transition"
                          >
                            crossfade
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Right inspector ---------------- */}
        <div className="w-72 border-l border-slate-800 bg-[#0F172A] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3.5 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                <Sliders className="w-3 h-3 text-cyan-400" />
                Output
              </span>

              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Files</span>
                  <span className="font-mono text-slate-200">{state.items.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Total length</span>
                  <span className="font-mono text-cyan-300">{formatDuration(totalMs)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Sample rate</span>
                  <select
                    value={state.sample_rate}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, sample_rate: Number(e.target.value) }))
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                  >
                    <option value={44100}>44.1 kHz</option>
                    <option value={48000}>48 kHz</option>
                    <option value={96000}>96 kHz</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.apply_master_chain}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, apply_master_chain: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-700 accent-emerald-500"
                />
                <span className="text-[11px] text-slate-300 leading-snug">
                  Apply mastering chain
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    Off by default. With it off the files are joined exactly as they are,
                    with no EQ, compression or loudness change.
                  </span>
                </span>
              </label>
            </div>

            {/* Selected item controls */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">
                Selected Item
              </span>

              {!selected ? (
                <p className="text-[11px] text-slate-500">
                  Click an item in the list to adjust its level and what follows it.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-slate-200 font-medium truncate" title={selected.name}>
                    {selected.name}
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">Gain</span>
                      <span className="font-mono text-emerald-400">
                        {linearToDb(selected.gain) > 0 ? '+' : ''}
                        {linearToDb(selected.gain).toFixed(1)} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-24}
                      max={6}
                      step={0.5}
                      value={linearToDb(selected.gain)}
                      onChange={(e) =>
                        updateItem(selected.id, { gain: dbToLinear(Number(e.target.value)) })
                      }
                      className="w-full si-slider [--si-accent:#10b981]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">Gap after</span>
                      <span className="font-mono text-amber-400">
                        {(selected.gap_after_ms / 1000).toFixed(2)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={selected.gap_after_ms}
                      disabled={selected.crossfade_ms > 0}
                      onChange={(e) =>
                        updateItem(selected.id, {
                          gap_after_ms: Number(e.target.value),
                          crossfade_ms: 0,
                        })
                      }
                      className="w-full si-slider [--si-accent:#f59e0b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">Crossfade into next</span>
                      <span className="font-mono text-cyan-400">
                        {(selected.crossfade_ms / 1000).toFixed(2)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={selected.crossfade_ms}
                      onChange={(e) =>
                        updateItem(selected.id, {
                          crossfade_ms: Number(e.target.value),
                          gap_after_ms: 0,
                        })
                      }
                      className="w-full si-slider [--si-accent:#22d3ee]"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      A crossfade overlaps this file with the next, so it shortens the total.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tag editor drawer */}
      {showTags && (
        <div className="h-64 border-t border-slate-800 shrink-0 flex flex-col min-h-0">
          <div className="px-4 py-1.5 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-400">
              Output File Tags
            </span>
            <button
              onClick={() => setShowTags(false)}
              className="text-slate-500 hover:text-slate-300 text-xs px-2 transition"
            >
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MetadataEditor
              metadata={state.metadata}
              onUpdateMetadata={(updates: Partial<MetadataDto>) =>
                onChange((prev) => ({ ...prev, metadata: { ...prev.metadata, ...updates } }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};
