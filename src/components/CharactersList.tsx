import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Character, BotSettings } from '../types';
import { User, ShieldAlert, Trash2, ShieldCheck, UserPlus, HelpCircle } from 'lucide-react';

interface CharactersListProps {
  characters: Character[];
  settings: BotSettings;
  onAddCharacter: (id: string, name: string, isSimulated: boolean) => Promise<void>;
  onDeleteCharacter: (id: string) => Promise<void>;
}

export default function CharactersList({ characters, settings, onAddCharacter, onDeleteCharacter }: CharactersListProps) {
  const [manualName, setManualName] = useState('');
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualId) return;
    onAddCharacter(manualId.trim(), manualName.trim(), true);
    setManualName('');
    setManualId('');
    setShowManual(false);
  };

  const handleSSOLogin = () => {
    // If we are in simulation mode, our server has a beautiful bypass that logs in a mock pilot instantly.
    // Otherwise, it triggers the real OAuth SSO flow if client credentials are set.
    const appIdUrl = window.location.origin;
    const loginUrl = `${appIdUrl}/api/auth/eve/login?chatId=web_user_${Math.floor(Math.random() * 100000)}`;
    
    // Open EVE SSO in a popup window to bypass the iframe block (X-Frame-Options SAMEORIGIN / DENY)
    const width = 600;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      loginUrl,
      'eve_sso_popup',
      `width=${width},height=${height},top=${top},left=${left},status=yes,resizable=yes`
    );

    if (!popup) {
      alert('Пожалуйста, разрешите всплывающие окна в настройках браузера, чтобы войти через EVE SSO!');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm shadow-xl"
    >
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-100">Мониторинг персонажей</h2>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-mono font-semibold">
          Всего: {characters.length}
        </span>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
          <ShieldAlert className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-sm font-medium">Нет подключенных персонажей</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            Добавьте персонажа ниже, чтобы бот начал отслеживать его рыночные ордера.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-1">
          {characters.map((char) => (
            <div
              key={char.id}
              className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800 rounded-lg hover:border-slate-750 transition-all"
            >
              <div className="flex items-center gap-3">
                <img
                  src={char.avatar}
                  alt={char.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full border border-slate-800 bg-slate-900"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-200">{char.name}</span>
                    {char.isSimulated && (
                      <span className="text-[9px] font-bold bg-slate-800 text-indigo-400 border border-indigo-950 px-1 py-0.2 rounded uppercase">
                        Демо
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                    <span>ID: {char.id}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {char.status === 'active' ? (
                        <>
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Активен ({char.activeOrdersCount} орд.)</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          <span className="text-rose-400">Токен истек</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDeleteCharacter(char.id)}
                title="Удалить персонажа"
                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Adding Options */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        {/* EVE SSO OAuth Login Button */}
        <button
          onClick={handleSSOLogin}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-950/40"
        >
          <img 
            src="https://images.evetech.net/types/22/icon?size=32" 
            alt="EVE" 
            referrerPolicy="no-referrer" 
            className="w-5 h-5 rounded-sm"
          />
          {settings.isSimulationMode 
            ? 'Добавить демо-персонажа через EVE SSO' 
            : 'Войти через EVE Online SSO (Реальный)'}
        </button>

        {settings.isSimulationMode && (
          <div className="text-center">
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
            >
              {showManual ? 'Скрыть ручное добавление' : 'Добавить персонажа вручную по ID'}
            </button>
          </div>
        )}

        {showManual && settings.isSimulationMode && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            onSubmit={handleManualAdd}
            className="p-3.5 bg-slate-950/80 rounded-lg border border-indigo-950/40 space-y-3"
          >
            <div className="text-xs font-bold text-indigo-300 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" /> Быстрое ручное добавление (Для тестов)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Имя пилота</label>
                <input
                  type="text"
                  required
                  placeholder="Ivan Drago"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 rounded outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Character ID</label>
                <input
                  type="text"
                  required
                  placeholder="95465499"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 rounded outline-none font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-3 rounded cursor-pointer transition-colors"
            >
              Добавить этого пилота
            </button>
          </motion.form>
        )}
      </div>
    </motion.div>
  );
}
