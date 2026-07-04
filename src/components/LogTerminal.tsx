import React from 'react';
import { motion } from 'motion/react';
import { BotLog } from '../types';
import { Terminal, ShieldAlert, ShieldCheck, Info, Trash2 } from 'lucide-react';

interface LogTerminalProps {
  logs: BotLog[];
}

export default function LogTerminal({ logs }: LogTerminalProps) {
  const getLogBadge = (level: string) => {
    switch (level) {
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
            <ShieldCheck className="w-3 h-3" /> OK
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-amber-950/50 text-amber-400 border border-amber-900/40 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
            <ShieldAlert className="w-3 h-3 animate-pulse" /> WARN
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-rose-950/50 text-rose-400 border border-rose-900/40 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
            <ShieldAlert className="w-3 h-3" /> FAIL
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] bg-sky-950/50 text-sky-400 border border-sky-900/40 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-emerald-300';
      case 'warning': return 'text-amber-300';
      case 'error': return 'text-rose-300';
      default: return 'text-slate-300';
    }
  };

  const getLogTypeBadge = (type: string) => {
    switch (type) {
      case 'bot': return 'bg-indigo-950/30 text-indigo-400 border border-indigo-900/30';
      case 'market': return 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30';
      case 'sso': return 'bg-amber-950/30 text-amber-400 border border-amber-900/30';
      default: return 'bg-slate-950/30 text-slate-400 border border-slate-900/30';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono flex flex-col h-[280px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200">Панель диагностики и логов</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold select-none">
          <span>Разработчик</span>
        </div>
      </div>

      {/* Terminal log panel */}
      <div className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1 scrollbar-thin">
        {logs.length === 0 ? (
          <div className="text-slate-600 flex items-center justify-center h-full text-center text-xs italic">
            Логи пусты. Запустите проверку ордеров для генерации логов.
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row sm:items-start gap-2 border-b border-slate-950/45 pb-1.5 hover:bg-slate-900/10 transition-colors">
              {/* Timestamp */}
              <span className="text-slate-600 shrink-0 select-none text-[10px] sm:text-xs">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>

              {/* Status and Type Badges */}
              <div className="flex items-center gap-1.5 shrink-0">
                {getLogBadge(log.level)}
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wide font-mono ${getLogTypeBadge(log.type)}`}>
                  {log.type}
                </span>
              </div>

              {/* Message */}
              <span className={`leading-relaxed break-all flex-1 ${getLogColor(log.level)}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
