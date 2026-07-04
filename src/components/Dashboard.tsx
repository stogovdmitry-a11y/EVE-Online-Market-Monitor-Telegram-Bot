import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Character, Order, BotSettings, BotLog } from '../types';
import BotConfig from './BotConfig';
import CharactersList from './CharactersList';
import OrdersGrid from './OrdersGrid';
import IndustryProjects from './IndustryProjects';
import ChatSimulator from './ChatSimulator';
import LogTerminal from './LogTerminal';
import { Bot, ShieldCheck, AlertTriangle, Compass, Clock, Link2, Globe, Sparkles, Database, Hammer } from 'lucide-react';

export default function Dashboard() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Success alert states from SSO redirect
  const [ssoToast, setSsoToast] = useState<{ show: boolean; name: string }>({ show: false, name: '' });

  // Current UTC time state - EVE Time!
  const [eveTime, setEveTime] = useState<string>('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setCharacters(data.characters || []);
        setOrders(data.orders || []);
        setProjects(data.projects || []);
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Check URL parameters for successful EVE SSO authentication
    const params = new URLSearchParams(window.location.search);
    if (params.get('sso_success') === 'true') {
      const charName = params.get('char_name') || 'Pilot';
      setSsoToast({ show: true, name: charName });
      
      // Clean up URL query parameters so toast doesn't reappear on reload
      window.history.replaceState({}, document.title, window.location.pathname);

      // Hide toast after 6 seconds
      setTimeout(() => {
        setSsoToast(prev => ({ ...prev, show: false }));
      }, 6000);
    }

    // Handle postMessage from EVE SSO popup
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const charName = event.data?.charName || 'Pilot';
        setSsoToast({ show: true, name: charName });
        fetchStatus();

        // Hide toast after 6 seconds
        setTimeout(() => {
          setSsoToast(prev => ({ ...prev, show: false }));
        }, 6000);
      }
    };
    window.addEventListener('message', handleMessage);

    // Set up rapid periodic updates (polling) to keep logs, chat and status perfectly fresh!
    const pollInterval = setInterval(fetchStatus, 4000);

    // EVE UTC Time clock
    const updateEveTime = () => {
      const now = new Date();
      const utcString = now.toISOString().replace('T', ' ').substring(0, 19);
      setEveTime(utcString);
    };
    updateEveTime();
    const clockInterval = setInterval(updateEveTime, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pollInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const handleSaveSettings = async (newSettings: Partial<BotSettings>) => {
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        await fetchStatus();
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleForceCheck = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/check', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
        setProjects(data.projects || []);
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Error forcing market check:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleAddCharacter = async (id: string, name: string, isSimulated: boolean) => {
    try {
      const res = await fetch('/api/characters/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, isSimulated })
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters);
        setOrders(data.orders);
        await fetchStatus();
      } else {
        const errorData = await res.json();
        alert(`Ошибка добавления персонажа: ${errorData.error}`);
      }
    } catch (err) {
      console.error('Error adding character:', err);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого персонажа и прекратить мониторинг его ордеров?')) {
      return;
    }
    try {
      const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters);
        setOrders(data.orders);
        await fetchStatus();
      }
    } catch (err) {
      console.error('Error deleting character:', err);
    }
  };

  const handleSendMessage = async (text: string): Promise<string> => {
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, chatId: 'simulation_user_1' })
      });
      if (res.ok) {
        const data = await res.json();
        // Update local logs right away for immediate feedback
        setLogs(data.logs || []);
        return data.reply;
      }
    } catch (err) {
      console.error('Error sending chat message:', err);
    }
    return '❌ Ошибка обмена данными с сервером.';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex flex-col items-center justify-center text-slate-400 font-mono">
        <Compass className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wider uppercase animate-pulse">Загрузка данных ESI & Bot...</p>
      </div>
    );
  }

  // Active status checks
  const totalOrders = orders.length;
  const undercutOrdersCount = orders.filter(o => o.status === 'undercut').length;
  const isBotActive = settings?.isBotRunning || false;

  return (
    <div className="min-h-screen bg-[#0d0f14] text-slate-100 flex flex-col selection:bg-indigo-500/35">
      {/* SSO Toast notification */}
      <AnimatePresence>
        {ssoToast.show && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-indigo-950/95 border-2 border-indigo-500 text-slate-100 px-6 py-3.5 rounded-xl shadow-2xl backdrop-blur-md max-w-md w-[90%] text-center text-sm flex items-center gap-3"
          >
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="text-left">
              <span className="font-bold text-indigo-300 block">EVE SSO Авторизован!</span>
              <span className="text-xs text-slate-300">Персонаж <span className="text-emerald-400 font-semibold">{ssoToast.name}</span> успешно привязан и отслеживается.</span>
            </div>
            <button
              onClick={() => setSsoToast({ show: false, name: '' })}
              className="ml-auto text-indigo-400 hover:text-indigo-300 cursor-pointer font-bold font-mono text-xs"
            >
              Закрыть
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Header Branding */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/40 border border-slate-850 p-5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-950/50">
              <Bot className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-100">EVE Market Monitor</h1>
                <span className="text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-900/60 px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Панель управления и Telegram бот для проверки конкурентных ордеров на рынке Jita IV - Moon 4.
              </p>
            </div>
          </div>

          {/* Time & Server Stats panel */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/50 px-4 py-2.5 rounded-xl border border-slate-850/60 font-mono text-xs mt-1 md:mt-0">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>EVE Time (UTC):</span>
              <span className="text-slate-100 font-semibold">{eveTime.split(' ')[1] || '00:00:00'}</span>
            </div>
            <span className="text-slate-700 select-none">|</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Режим:</span>
              <span className={`font-semibold ${settings?.isSimulationMode ? 'text-indigo-400' : 'text-emerald-400'}`}>
                {settings?.isSimulationMode ? '🧪 Симуляция' : '🛰️ Реальный ESI'}
              </span>
            </div>
          </div>
        </div>

        {/* Top bento stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Bot State */}
          <div className="bg-slate-900/50 border border-slate-850/80 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
            <div className={`p-2.5 rounded-lg shrink-0 ${isBotActive ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30' : 'bg-slate-950/60 text-slate-500 border border-slate-850'}`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono uppercase block">Telegram Бот</span>
              <span className="text-sm font-bold text-slate-100 leading-tight block mt-0.5">
                {isBotActive ? 'Запущен / Активен' : 'Отключен'}
              </span>
            </div>
          </div>

          {/* Stat 2: Monitored characters */}
          <div className="bg-slate-900/50 border border-slate-850/80 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
            <div className="p-2.5 rounded-lg shrink-0 bg-slate-950/60 text-emerald-400 border border-slate-850">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono uppercase block">Пилотов в базе</span>
              <span className="text-sm font-bold text-slate-100 leading-tight block mt-0.5">
                {characters.length} EVE аккаунтов
              </span>
            </div>
          </div>

          {/* Stat 3: Total orders */}
          <div className="bg-slate-900/50 border border-slate-850/80 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
            <div className="p-2.5 rounded-lg shrink-0 bg-slate-950/60 text-sky-400 border border-slate-850">
              <Compass className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono uppercase block">Ордеров на контроле</span>
              <span className="text-sm font-bold text-slate-100 leading-tight block mt-0.5">
                {totalOrders} активных ордеров
              </span>
            </div>
          </div>

          {/* Stat 4: Beaten Orders Count */}
          <div className="bg-slate-900/50 border border-slate-850/80 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
            <div className={`p-2.5 rounded-lg shrink-0 ${undercutOrdersCount > 0 ? 'bg-amber-950/50 text-amber-400 border border-amber-900/30 animate-pulse' : 'bg-slate-950/60 text-emerald-400 border border-slate-850'}`}>
              {undercutOrdersCount > 0 ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-mono uppercase block">Нас перебили (Undercut)</span>
              <span className={`text-sm font-bold leading-tight block mt-0.5 ${undercutOrdersCount > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
                {undercutOrdersCount === 0 ? 'Все цены лучшие!' : `${undercutOrdersCount} ордеров`}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard layouts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Side: Setup & Pilots List */}
          <div className="space-y-6 lg:col-span-1">
            {settings && (
              <BotConfig
                settings={settings}
                onSaveSettings={handleSaveSettings}
                isSaving={isSavingSettings}
              />
            )}
            <CharactersList
              characters={characters}
              settings={settings || { telegramToken: '', intervalMinutes: 5, isBotRunning: false, isSimulationMode: true }}
              onAddCharacter={handleAddCharacter}
              onDeleteCharacter={handleDeleteCharacter}
            />
          </div>

          {/* Right Side: Active Orders List & Terminal & Chat simulator */}
          <div className="space-y-6 lg:col-span-2">
            
            {/* Monitored Orders */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Compass className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-slate-100">Текущие цены ордеров в Jita (The Forge)</h2>
              </div>
              <OrdersGrid
                orders={orders}
                onForceCheck={handleForceCheck}
                isChecking={isChecking}
              />
            </div>

            {/* Monitored Industry Projects */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Hammer className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-slate-100">Индустриальные проекты пилотов</h2>
              </div>
              <IndustryProjects projects={projects} />
            </div>

            {/* Bottom Dual Grid: Log Panel & Simulated Chat */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-slate-300">Интерактивный симулятор бота</span>
                </div>
                <ChatSimulator
                  onSendMessage={handleSendMessage}
                  onRefreshData={fetchStatus}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-slate-300">Журнал работы бота</span>
                </div>
                <LogTerminal logs={logs} />
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
