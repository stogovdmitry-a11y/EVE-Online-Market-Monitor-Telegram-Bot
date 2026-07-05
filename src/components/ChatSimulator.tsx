import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, BotLog } from '../types';
import { Send, Bot, User, Trash2, HelpCircle } from 'lucide-react';

interface ChatSimulatorProps {
  onSendMessage: (text: string) => Promise<string>;
  onRefreshData: () => Promise<void>;
}

export default function ChatSimulator({ onSendMessage, onRefreshData }: ChatSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: "👋 *Привет! Я EVE Market, Industry & Skill Monitor Bot!*\n\nЗдесь ты можешь отправлять команды для управления ботом и проверки статуса твоих персонажей.\n\n📋 *Доступные команды:*\n🔹 `/start` - показать список всех команд\n🔹 `/add_character` - подключить персонажа через EVE SSO\n🔹 `/list` - показать список персонажей и перебитых ордеров\n🔹 `/projects` - показать активные индустриальные проекты\n🔹 `/skills` - показать прокачанные навыки и очередь изучения\n🔹 `/check` - принудительно запустить проверку цен, проектов и навыков",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      // Send command to backend and receive bot reply
      const replyText = await onSendMessage(userText);
      
      const botMsg: ChatMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMsg]);
      
      // Refresh the main dashboard state to reflect any edits made via command (e.g., character deletion or forced checks)
      await onRefreshData();

    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        sender: 'bot',
        text: '⚠️ *Ошибка подключения:* Не удалось отправить сообщение на сервер.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCommandClick = (cmd: string) => {
    setInputText(cmd);
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'bot',
        text: "🧹 *Чат очищен!*\n\nОтправьте команду `/start` или нажмите на быстрые команды ниже для тестирования.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Convert Telegram Markdown to HTML string safely
  const renderMarkdown = (text: string) => {
    // Escape standard characters then parse **bold**, *italic*, [link](url) and `code`
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold: *text* or **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>');

    // Code: `code` or /command
    formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-slate-900/80 px-1 py-0.5 rounded text-amber-400 font-mono text-[11px]">$1</code>');

    // Links: [label](url)
    formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 font-semibold hover:underline">$1</a>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br/>');

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#0f141c] border border-slate-800 rounded-xl flex flex-col h-[520px] shadow-2xl relative overflow-hidden"
    >
      {/* Header (Mock Telegram Bot Top Bar) */}
      <div className="bg-[#181f2b] px-4 py-3 border-b border-slate-800/80 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white relative shadow-inner">
            <Bot className="w-5 h-5" />
            <div className="w-2.5 h-2.5 bg-emerald-500 border border-slate-900 rounded-full absolute bottom-0 right-0 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-1">
              EVE Market Monitor Bot
            </div>
            <div className="text-[11px] text-emerald-400 font-medium">@EveMarketMonitorBot • online</div>
          </div>
        </div>
        <button
          onClick={clearChat}
          title="Очистить чат"
          className="p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0d1017]">
        {messages.map((msg) => {
          const isBot = msg.sender === 'bot';
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 max-w-[85%] ${isBot ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
            >
              <div 
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  isBot 
                    ? 'bg-indigo-950/40 border-indigo-900/40 text-indigo-400' 
                    : 'bg-emerald-950/40 border-emerald-900/40 text-emerald-400'
                }`}
              >
                {isBot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs shadow-md border ${
                  isBot
                    ? 'bg-[#1a2130] text-slate-200 rounded-bl-none border-slate-800'
                    : 'bg-indigo-900/40 text-slate-100 rounded-br-none border-indigo-950'
                }`}
              >
                <div className="leading-relaxed break-words">{renderMarkdown(msg.text)}</div>
                <div className="text-[9px] text-slate-500 text-right mt-1.5 select-none font-mono">
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2 max-w-[80%] mr-auto">
            <div className="w-7 h-7 rounded-full bg-indigo-950/40 border border-indigo-900/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-[#1a2130] text-slate-400 rounded-2xl rounded-bl-none px-4 py-3 text-xs border border-slate-800 shadow-md">
              <span className="flex items-center gap-1 font-mono font-medium animate-pulse">
                Бот печатает <span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Access Hot Buttons */}
      <div className="px-3 py-1.5 bg-[#121822] border-t border-slate-800/60 overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 scrollbar-none">
        <button
          onClick={() => handleCommandClick('/start')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /start
        </button>
        <button
          onClick={() => handleCommandClick('/add_character')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /add_character
        </button>
        <button
          onClick={() => handleCommandClick('/list')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /list
        </button>
        <button
          onClick={() => handleCommandClick('/projects')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /projects
        </button>
        <button
          onClick={() => handleCommandClick('/skills')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-purple-400 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /skills
        </button>
        <button
          onClick={() => handleCommandClick('/check')}
          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-400 font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors"
        >
          /check
        </button>
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className="p-3 bg-[#181f2b] border-t border-slate-800/80 flex gap-2 shrink-0 items-center">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Напишите команду боту (например, /check)..."
          className="flex-1 bg-[#0d1017] border border-slate-800/80 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none transition-colors placeholder-slate-600"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl p-2 cursor-pointer transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </motion.div>
  );
}
