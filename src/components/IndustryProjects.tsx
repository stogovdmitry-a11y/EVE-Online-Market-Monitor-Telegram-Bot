import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IndustryJob } from '../types';
import { Search, Compass, Hammer, Clock, User, Landmark, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface IndustryProjectsProps {
  projects: IndustryJob[];
}

export default function IndustryProjects({ projects }: IndustryProjectsProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'personal' | 'corp'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [nowTime, setNowTime] = useState(Date.now());

  // Keep progress timers updated precisely every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredProjects = projects.filter(project => {
    const blueprintName = (project.blueprintTypeName || '').toLowerCase();
    const productName = (project.productTypeName || '').toLowerCase();
    const characterName = (project.characterName || '').toLowerCase();
    const installerName = (project.installerName || '').toLowerCase();
    const matchesSearch = blueprintName.includes(search.toLowerCase()) ||
                          productName.includes(search.toLowerCase()) ||
                          characterName.includes(search.toLowerCase()) ||
                          installerName.includes(search.toLowerCase());

    const matchesType = typeFilter === 'all' || 
                        (typeFilter === 'personal' && !project.isCorporation) ||
                        (typeFilter === 'corp' && project.isCorporation);

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Order alphabetically or by preferred layout
  const preferredOrder = [
    'Производство',
    'Исследование эффективности материалов (ME)',
    'Исследование дефицита времени (TE)',
    'Исследование эффективности времени (TE)',
    'Исследование технологий',
    'Копирование',
    'Изобретение',
    'Реакции'
  ];

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    // Active projects first
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }

    // Sort by type order
    const idxA = preferredOrder.findIndex(o => a.activityName.includes(o) || o.includes(a.activityName));
    const idxB = preferredOrder.findIndex(o => b.activityName.includes(o) || o.includes(b.activityName));
    const valA = idxA === -1 ? 999 : idxA;
    const valB = idxB === -1 ? 999 : idxB;
    
    if (valA !== valB) return valA - valB;

    // Finally sort by remaining time ascending
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  });

  const getProgress = (job: IndustryJob) => {
    const start = new Date(job.startDate).getTime();
    const end = new Date(job.endDate).getTime();
    const total = end - start;
    if (total <= 0) return 100;
    const elapsed = nowTime - start;
    const percentage = Math.min(100, Math.max(0, (elapsed / total) * 100));
    return parseFloat(percentage.toFixed(1));
  };

  const getRemainingTimeStr = (endDateStr: string) => {
    const end = new Date(endDateStr).getTime();
    const diff = end - nowTime;
    if (diff <= 0) return 'Завершен (Готов к получению!)';

    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}д ${hours % 24}ч ${mins % 60}м`;
    }
    if (hours > 0) {
      return `${hours}ч ${mins % 60}м ${secs % 60}с`;
    }
    return `${mins}м ${secs % 60}с`;
  };

  const formatZero = (num: number) => num < 10 ? '0' + num : num;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${formatZero(date.getDate())}.${formatZero(date.getMonth() + 1)}.${date.getFullYear()} ${formatZero(date.getHours())}:${formatZero(date.getMinutes())}:${formatZero(date.getSeconds())}`;
  };

  return (
    <div className="space-y-4">
      {/* Scope update helper banner */}
      <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-indigo-300">
        <Landmark className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">⚠️ Внимание для пилотов, добавивших персонажей ранее:</p>
          <p className="text-indigo-300/80 mt-0.5 leading-normal">
            Чтобы ваши индустриальные проекты отображались, вам нужно <strong>заново авторизовать персонажей через EVE Online SSO</strong>. Ранее запрашивался доступ только к рыночным ордерам. Новая авторизация даст приложению безопасные права на чтение ваших проектов пилота и корпорации.
          </p>
        </div>
      </div>

      {/* Header and filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 backdrop-blur-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по проекту, чертежу или пилоту..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 outline-none transition-colors placeholder-slate-600"
            />
          </div>

          {/* Type filters */}
          <div className="flex bg-slate-950/80 p-0.5 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Все
            </button>
            <button
              onClick={() => setTypeFilter('personal')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${typeFilter === 'personal' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              👤 Личные ({projects.filter(p => !p.isCorporation).length})
            </button>
            <button
              onClick={() => setTypeFilter('corp')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${typeFilter === 'corp' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🏢 Корпоративные ({projects.filter(p => p.isCorporation).length})
            </button>
          </div>

          {/* Status filters */}
          <div className="flex bg-slate-950/80 p-0.5 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${statusFilter === 'all' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Все статусы
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className="hidden"
            />
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-emerald-400 ${statusFilter === 'active' ? 'bg-emerald-950/30 text-emerald-400 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Активные ({projects.filter(p => p.status === 'active').length})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-indigo-400 ${statusFilter === 'completed' ? 'bg-indigo-950/30 text-indigo-400 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Завершенные ({projects.filter(p => p.status === 'completed' || p.status === 'ready').length})
            </button>
          </div>
        </div>
      </div>

      {/* Grid List */}
      {sortedProjects.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/40 rounded-xl p-12 text-center">
          <Hammer className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium text-sm">Проектов не найдено</p>
          <p className="text-xs text-slate-500 mt-1">Попробуйте изменить параметры фильтрации или добавить пилотов.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {sortedProjects.map((job) => {
              const progress = getProgress(job);
              const isCompleted = progress >= 100 || job.status !== 'active';
              const remainingStr = isCompleted ? 'Проект завершен' : getRemainingTimeStr(job.endDate);

              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className={`bg-slate-900/40 border p-4.5 rounded-xl transition-all hover:bg-slate-900/60 flex flex-col justify-between ${isCompleted ? 'border-indigo-500/30 shadow-indigo-950/10' : 'border-slate-800/80'}`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Icon + Type Name */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isCompleted ? 'bg-indigo-950/50 text-indigo-400' : 'bg-slate-950 text-indigo-500'}`}>
                          <Hammer className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase block leading-none">Тип проекта</span>
                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{job.activityName}</span>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex gap-1.5">
                        {job.isCorporation ? (
                          <span className="text-[9px] font-bold bg-slate-950 border border-slate-850 text-amber-500 px-2 py-0.5 rounded flex items-center gap-1 font-mono uppercase">
                            <Landmark className="w-2.5 h-2.5" /> Corp
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-slate-950 border border-slate-850 text-indigo-400 px-2 py-0.5 rounded flex items-center gap-1 font-mono uppercase">
                            <User className="w-2.5 h-2.5" /> Personal
                          </span>
                        )}

                        {isCompleted ? (
                          <span className="text-[9px] font-bold bg-indigo-950 border border-indigo-900 text-indigo-400 px-2 py-0.5 rounded flex items-center gap-1 font-mono uppercase animate-pulse">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-emerald-950 border border-emerald-900 text-emerald-400 px-2 py-0.5 rounded flex items-center gap-1 font-mono uppercase">
                            <Clock className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Project Name Details */}
                    <div>
                      <span className="text-sm font-semibold text-slate-100 block truncate">
                        {job.productTypeName ? `${job.productTypeName} (${job.blueprintTypeName})` : job.blueprintTypeName}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Прогресс: {isCompleted ? 100 : progress}%</span>
                        <span>{remainingStr}</span>
                      </div>
                      <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${isCompleted ? 100 : progress}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full rounded-full ${isCompleted ? 'bg-indigo-500' : 'bg-gradient-to-r from-emerald-500 to-indigo-500'}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row Details: Initiator & End Date */}
                  <div className="mt-4 pt-3 border-t border-slate-850/60 flex items-center justify-between text-[10px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Инициатор:</span>
                      <span className="text-slate-200 font-medium font-mono truncate max-w-[110px]">{job.installerName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Окончание:</span>
                      <span className="text-slate-200 font-medium font-mono">{formatDate(job.endDate)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
