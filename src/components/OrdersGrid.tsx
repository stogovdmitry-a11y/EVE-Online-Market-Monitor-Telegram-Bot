import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../types';
import { TrendingUp, AlertTriangle, CheckCircle, Search, Filter, Compass, User } from 'lucide-react';

interface OrdersGridProps {
  orders: Order[];
  onForceCheck: () => Promise<void>;
  isChecking: boolean;
}

export default function OrdersGrid({ orders, onForceCheck, isChecking }: OrdersGridProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'best' | 'undercut'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'buy' | 'sell'>('all');

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.itemName.toLowerCase().includes(search.toLowerCase()) ||
                          order.characterName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesType = typeFilter === 'all' || 
                        (typeFilter === 'buy' && order.isBuyOrder) || 
                        (typeFilter === 'sell' && !order.isBuyOrder);
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatIsk = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num) + ' ISK';
  };

  return (
    <div className="space-y-4">
      {/* Filters and Controls */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 backdrop-blur-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по предмету или пилоту..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 outline-none transition-colors placeholder-slate-600"
            />
          </div>

          {/* Status filters */}
          <div className="flex bg-slate-950/80 p-0.5 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${statusFilter === 'all' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Все ({orders.length})
            </button>
            <button
              onClick={() => setStatusFilter('best')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${statusFilter === 'best' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/50 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Лучшая ({orders.filter(o => o.status === 'best').length})
            </button>
            <button
              onClick={() => setStatusFilter('undercut')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${statusFilter === 'undercut' ? 'bg-amber-950 text-amber-400 border border-amber-900/50 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Перебит ({orders.filter(o => o.status === 'undercut').length})
            </button>
          </div>

          {/* Type filters */}
          <div className="flex bg-slate-950/80 p-0.5 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Все типы
            </button>
            <button
              onClick={() => setTypeFilter('buy')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-emerald-400 ${typeFilter === 'buy' ? 'bg-emerald-950/30 text-emerald-400 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Покупка
            </button>
            <button
              onClick={() => setTypeFilter('sell')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-rose-400 ${typeFilter === 'sell' ? 'bg-rose-950/30 text-rose-400 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Продажа
            </button>
          </div>
        </div>

        {/* Force Check Action */}
        <button
          onClick={onForceCheck}
          disabled={isChecking}
          className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:from-indigo-700 active:to-indigo-800 disabled:from-slate-800 disabled:to-slate-900 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-950/30 shrink-0"
        >
          <TrendingUp className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Проверяю цены...' : 'Принудительная проверка (Check)'}
        </button>
      </div>

      {/* Orders Grid Display */}
      {filteredOrders.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-850 rounded-xl py-12 flex flex-col items-center justify-center text-slate-500 text-center">
          <Compass className="w-12 h-12 text-slate-700 mb-2 animate-pulse" />
          <p className="text-sm font-medium text-slate-400">Ордера по вашему запросу не найдены</p>
          <p className="text-xs text-slate-600 max-w-sm mt-1">
            Попробуйте изменить поисковой запрос или сбросить активные фильтры.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((order) => {
              const isBest = order.status === 'best';
              const priceDifference = Math.abs(order.bestPrice - order.price);
              const isBuy = order.isBuyOrder;

              return (
                <motion.div
                  layout
                  key={order.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`bg-slate-900/50 rounded-xl border p-4 shadow-md hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between ${
                    isBest 
                      ? 'border-emerald-950/40 hover:border-emerald-900/30' 
                      : 'border-amber-950/50 hover:border-amber-900/40'
                  }`}
                >
                  {/* Sidebar Color Marker */}
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                  {/* Top Card Section */}
                  <div className="flex gap-3 relative z-10">
                    {/* Item Image */}
                    <img
                      src={`https://images.evetech.net/types/${order.itemId}/icon?size=64`}
                      alt={order.itemName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg border border-slate-800 bg-slate-950 shrink-0 self-start"
                    />

                    {/* Order Details */}
                    <div className="space-y-1 w-full min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-100 truncate tracking-tight">{order.itemName}</h3>
                        
                        {/* Status Badge */}
                        {isBest ? (
                          <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                            <CheckCircle className="w-3 h-3" /> Лучшая
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-900 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> Перебит!
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 font-mono">
                        <span className="flex items-center gap-1 text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-500" /> {order.characterName}
                        </span>
                        <span>•</span>
                        <span className={`font-semibold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isBuy ? 'Покупка (Buy)' : 'Продажа (Sell)'}
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-[150px] text-slate-500" title={order.locationName}>
                          {order.locationName.split(' - ')[0]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price Comparison Block */}
                  <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-950/50 rounded-lg border border-slate-850/60 font-mono text-xs mt-3">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Моя цена</span>
                      <span className={`font-bold ${isBest ? 'text-slate-200' : 'text-amber-500'}`}>
                        {formatIsk(order.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Лучшая в регионе</span>
                      <span className={`font-bold ${isBest ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatIsk(order.bestPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Alerts and Progress Bars */}
                  <div className="mt-3.5 space-y-2">
                    {/* Volume tracker */}
                    <div className="space-y-1 font-mono text-[10px]">
                      <div className="flex justify-between text-slate-500">
                        <span>Объем: {order.volumeRemain.toLocaleString()} / {order.volumeTotal.toLocaleString()}</span>
                        <span>{Math.round((order.volumeRemain / order.volumeTotal) * 100)}% осталось</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-850">
                        <div 
                          className={`h-full rounded-full ${isBuy ? 'bg-emerald-600' : 'bg-rose-600'}`}
                          style={{ width: `${(order.volumeRemain / order.volumeTotal) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Pricing Disadvantage Note */}
                    {!isBest && (
                      <div className="bg-amber-950/20 border border-amber-900/30 rounded-md px-2.5 py-1.5 text-xs text-amber-400 font-mono leading-tight flex items-center justify-between">
                        <span>
                          Разница в цене:
                        </span>
                        <span className="font-bold">
                          - {priceDifference.toFixed(2)} ISK
                        </span>
                      </div>
                    )}

                    {/* Last checked indicator */}
                    <div className="text-[10px] text-slate-600 text-right font-mono select-none pt-1">
                      Проверен: {new Date(order.lastChecked).toLocaleTimeString()}
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
