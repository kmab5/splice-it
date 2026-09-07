import React from 'react';
import { LayoutGrid, ListOrdered, Keyboard, X } from 'lucide-react';
import { APP_VERSION } from '../version';

interface WelcomeModalProps {
  isOpen: boolean;
  onChoose: (mode: 'timeline' | 'concat') => void;
  onDismiss: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onChoose, onDismiss }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[80] flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo.png"
              alt=""
              className="w-11 h-11 rounded-lg object-cover shadow-lg shadow-emerald-500/20"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div>
              <h2 className="text-base font-bold text-slate-100">Welcome to Splice It</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Version {APP_VERSION} — pick how you want to work. You can switch at any time.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onChoose('concat')}
            className="text-left p-4 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-cyan-500/60 hover:bg-cyan-950/20 transition group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <ListOrdered className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-100">Concat</span>
              <span className="text-[9px] uppercase tracking-wider text-cyan-400/80 font-bold ml-auto">
                Simple
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Drop in files, drag them into the order you want, and export one joined
              file. Add gaps or crossfades between tracks, set the tags, and go.
            </p>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Nothing is applied to your audio unless you ask for it — with the mastering
              chain off, files are joined exactly as they are.
            </p>
          </button>

          <button
            onClick={() => onChoose('timeline')}
            className="text-left p-4 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-emerald-500/60 hover:bg-emerald-950/20 transition group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-100">Timeline</span>
              <span className="text-[9px] uppercase tracking-wider text-emerald-400/80 font-bold ml-auto">
                Detailed
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Multitrack editing: place clips on tracks, trim and split them, set fades,
              volume and pan, and run a mastering chain with EQ, compression and a limiter.
            </p>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Use this when you need overlap, layering, or per-clip control.
            </p>
          </button>
        </div>

        <div className="px-6 pb-5">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
              <Keyboard className="w-3 h-3" />
              Worth knowing
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
              {[
                ['Space', 'Play or pause the current view'],
                ['← / →', 'Scrub 5s (Ctrl 15s, Alt 30s)'],
                ['Ctrl+S', 'Save the project'],
                ['Ctrl+O', 'Open a project'],
                ['Drag & drop', 'Import audio anywhere in the window'],
                ['Right-click', 'Context menu in both workspaces'],
              ].map(([key, label]) => (
                <div key={key} className="flex justify-between gap-3">
                  <span className="font-mono text-slate-300 shrink-0">{key}</span>
                  <span className="text-slate-500 text-right">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            Both workspaces are saved together in one .sic project file.
          </span>
          <button
            onClick={onDismiss}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
