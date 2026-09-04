import React from 'react';
import { X, Save, Clock, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { AppSettings } from '../types/project';
import { APP_VERSION } from '../version';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onChange: (updates: Partial<AppSettings>) => void;
  onClose: () => void;
  /** Where the current project is saved, if anywhere. */
  savedPath: string | null;
  lastAutoSaveAt: number | null;
  onClearRecent: () => void;
}

const AUTO_SAVE_INTERVALS = [1, 2, 5, 10, 15, 30];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onChange,
  onClose,
  savedPath,
  lastAutoSaveAt,
  onClearRecent,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-slate-500/10 border border-slate-500/20 text-slate-300">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Settings</h3>
              <p className="text-[11px] text-slate-400">Splice It v{APP_VERSION}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs text-slate-200">
          {/* Auto-save */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-emerald-400" />
              Auto-save
            </span>

            <label className="flex items-center justify-between cursor-pointer bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5">
              <span className="text-slate-200 font-medium">Save automatically</span>
              <button
                type="button"
                onClick={() => onChange({ autoSaveEnabled: !settings.autoSaveEnabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  settings.autoSaveEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    settings.autoSaveEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <div
              className={`bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5 space-y-2 ${
                settings.autoSaveEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Every</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.autoSaveMinutes}
                    onChange={(e) => onChange({ autoSaveMinutes: Number(e.target.value) })}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {AUTO_SAVE_INTERVALS.map((m) => (
                      <option key={m} value={m}>
                        {m} minute{m === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!savedPath ? (
                <p className="text-[10px] text-amber-400/90 flex items-start gap-1.5 pt-1 border-t border-slate-800/60">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                  <span>
                    Auto-save starts once you have saved this project once, so it never has to
                    guess a filename. Use Ctrl+S.
                  </span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60 break-all">
                  Saving to {savedPath}
                  {lastAutoSaveAt && (
                    <span className="block text-emerald-400/80 mt-0.5">
                      Last auto-save {new Date(lastAutoSaveAt).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Project behaviour */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Save className="w-3 h-3 text-cyan-400" />
              Projects
            </span>

            <label className="flex items-center justify-between cursor-pointer bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5">
              <span className="text-slate-200">Confirm before discarding changes</span>
              <button
                type="button"
                onClick={() => onChange({ confirmOnDiscard: !settings.confirmOnDiscard })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  settings.confirmOnDiscard ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    settings.confirmOnDiscard ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5">
              <span className="text-slate-200">Reopen last project on launch</span>
              <button
                type="button"
                onClick={() => onChange({ reopenLastProject: !settings.reopenLastProject })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  settings.reopenLastProject ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    settings.reopenLastProject ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5">
              <span className="text-slate-200">
                Recent projects
                <span className="text-slate-500 font-mono ml-1.5">
                  ({settings.recentProjects.length})
                </span>
              </span>
              <button
                type="button"
                onClick={onClearRecent}
                disabled={settings.recentProjects.length === 0}
                className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-30"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5">
              <span className="text-slate-200">Default sample rate</span>
              <select
                value={settings.defaultSampleRate}
                onChange={(e) => onChange({ defaultSampleRate: Number(e.target.value) })}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48 kHz</option>
                <option value={96000}>96 kHz</option>
              </select>
            </div>
          </div>

          {/* Shortcut reference */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Shortcuts
            </span>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5 space-y-1 text-[11px] text-slate-400 font-mono">
              {[
                ['Ctrl+S', 'Save project'],
                ['Ctrl+Shift+S', 'Save project as…'],
                ['Ctrl+O', 'Open project'],
                ['Space', 'Play / pause the current view'],
                ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
              ].map(([key, label]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-300">{key}</span>
                  <span className="text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
