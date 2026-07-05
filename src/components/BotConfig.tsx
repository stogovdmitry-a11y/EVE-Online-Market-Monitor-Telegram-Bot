import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BotSettings } from '../types';
import { Settings, Info, Bot, HelpCircle, RefreshCw } from 'lucide-react';

interface BotConfigProps {
  settings: BotSettings;
  onSaveSettings: (settings: Partial<BotSettings>) => Promise<void>;
  isSaving: boolean;
}

export default function BotConfig({ settings, onSaveSettings, isSaving }: BotConfigProps) {
  const [token, setToken] = useState(settings.telegramToken);
  const [interval, setInterval] = useState(settings.intervalMinutes);
  const [clientId, setClientId] = useState(settings.eveClientId || '');
  const [clientSecret, setClientSecret] = useState(settings.eveClientSecret || '');
  const [industryEnabled, setIndustryEnabled] = useState(settings.industryNotificationsEnabled !== false);
  const [skillsEnabled, setSkillsEnabled] = useState(settings.skillsNotificationsEnabled !== false);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      telegramToken: token,
      intervalMinutes: Number(interval),
      isSimulationMode: false,
      eveClientId: clientId,
      eveClientSecret: clientSecret,
      industryNotificationsEnabled: industryEnabled,
      skillsNotificationsEnabled: skillsEnabled
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm shadow-xl"
    >
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-slate-100">Настройки интеграции</h2>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          {showHelp ? 'Скрыть инструкцию' : 'Как настроить?'}
        </button>
      </div>

      {showHelp && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-5 p-4 bg-slate-950/80 rounded-lg border border-indigo-950/50 text-xs leading-relaxed text-slate-300 space-y-3"
        >
          <div>
            <h4 className="font-semibold text-indigo-300 flex items-center gap-1.5 mb-1 text-sm">
              <Bot className="w-4 h-4" />
              Шаг 1: Настройка Telegram Бота
            </h4>
            <ol className="list-decimal list-inside space-y-1 ml-1 text-slate-300">
              <li>Найди <span className="text-indigo-400">@BotFather</span> в Telegram.</li>
              <li>Отправь команду <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300 font-mono">/newbot</code> и следуй подсказкам для создания бота.</li>
              <li>Скопируй полученный <span className="text-emerald-400">API Token</span> и вставь его в поле «Telegram API Токен» ниже.</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-indigo-300 flex items-center gap-1.5 mb-1 text-sm">
              <Info className="w-4 h-4" />
              Шаг 2: Настройка EVE SSO
            </h4>
            <p className="mb-1">
              Чтобы использовать данные своего EVE-персонажа:
            </p>
            <ol className="list-decimal list-inside space-y-1 ml-1 text-slate-300">
              <li>Перейди на <a href="https://developers.eveonline.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline font-semibold">EVE Developers Portal</a> и создай приложение.</li>
              <li>Установи Callback URL как: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono break-all text-[10px] select-all">{typeof window !== 'undefined' ? `${window.location.origin}/api/auth/eve/callback` : 'https://<APP_URL>/api/auth/eve/callback'}</code></li>
              <li>Добавь следующие пять областей видимости (scopes):
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-amber-400 font-mono text-[11px]">
                  <li>esi-markets.read_character_orders.v1</li>
                  <li>esi-industry.read_character_jobs.v1</li>
                  <li>esi-industry.read_corporation_jobs.v1</li>
                  <li>esi-skills.read_skills.v1</li>
                  <li>esi-skills.read_skillqueue.v1</li>
                </ul>
              </li>
              <li className="mt-1.5">Скопируй <span className="text-indigo-400 font-semibold">Client ID</span> и <span className="text-indigo-400 font-semibold">Secret Key</span> и вставь их в форму ниже.</li>
            </ol>
          </div>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Industry Notifications Switch */}
        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800">
          <div>
            <label className="text-sm font-medium text-slate-200 block">Оповещения по индустрии</label>
            <span className="text-xs text-slate-400 block">
              Отправлять уведомления в Telegram при завершении производственных и научных проектов.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIndustryEnabled(!industryEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${industryEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${industryEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Skills Notifications Switch */}
        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800">
          <div>
            <label className="text-sm font-medium text-slate-200 block">Оповещения об изучении навыков</label>
            <span className="text-xs text-slate-400 block">
              Отправлять уведомления в Telegram при завершении изучения навыков персонажа.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSkillsEnabled(!skillsEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${skillsEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${skillsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Telegram Token Input */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Telegram API Токен бота
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="548175923:AAHfdg..."
            className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Check Interval Minutes */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Интервал проверки (минут)
            </label>
            <select
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer transition-colors"
            >
              <option value="1">1 минута (для тестов)</option>
              <option value="5">5 минут</option>
              <option value="15">15 минут</option>
              <option value="30">30 минут</option>
              <option value="60">60 минут</option>
            </select>
          </div>

          {/* Bot State Banner */}
          <div className="flex flex-col justify-center px-4 py-2 bg-slate-950/40 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-400">Статус Telegram-бота:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${settings.isBotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-sm font-semibold text-slate-200">
                {settings.isBotRunning ? 'АКТИВЕН / ОПРОС' : 'ОСТАНОВЛЕН (Нет токена)'}
              </span>
            </div>
          </div>
        </div>

        {/* Real Mode Client ID / Secret if simulation is off */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3 pt-2 border-t border-slate-800"
        >
          <div className="text-xs font-bold text-indigo-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> Настройки разработчика EVE Online ESI (SSO)
          </div>
          
          <div className="bg-slate-950/80 rounded-lg p-3 border border-indigo-950 text-slate-300 space-y-1 font-mono text-[11px]">
            <span className="text-indigo-400 font-bold block text-[9px] uppercase tracking-wider">Callback URL для приложения EVE Portal:</span>
            <span className="text-emerald-400 font-semibold break-all select-all">{typeof window !== 'undefined' ? `${window.location.origin}/api/auth/eve/callback` : 'https://<APP_URL>/api/auth/eve/callback'}</span>
            <span className="text-slate-500 block text-[9px] mt-1">💡 Нажмите дважды для выделения и скопируйте.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                EVE Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="3c91e779a5..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder-slate-700 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                EVE Secret Key
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder-slate-700 outline-none"
              />
            </div>
          </div>
        </motion.div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Settings className="w-4 h-4" />
          )}
          Сохранить настройки
        </button>
      </form>
    </motion.div>
  );
}
