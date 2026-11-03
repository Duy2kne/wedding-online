import React, { useState } from 'react';
import { X, Trophy, Medal, Crown, Star, Users } from 'lucide-react';
import type { LeaderboardEntry } from '../shared/types.js';

interface LeaderboardModalProps {
  entries: LeaderboardEntry[];
  currentUid: string;
  currentHallName?: string;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  entries,
  currentUid,
  currentHallName,
  onClose,
}) => {
  const [tab, setTab] = useState<'all' | 'hall' | 'groom' | 'bride' | 'friends'>('all');

  const filtered = entries.filter((item) => {
    if (tab === 'hall') return item.hallName === currentHallName;
    if (tab === 'groom') return item.group === 'groom';
    if (tab === 'bride') return item.group === 'bride';
    if (tab === 'friends') return item.group === 'friends';
    return true;
  });

  const myRank = entries.findIndex((e) => e.uid === currentUid) + 1;
  const myEntry = entries.find((e) => e.uid === currentUid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-400 text-white shadow-md">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 font-serif">
                Bảng Vàng Điểm Hỷ 💗
              </h2>
              <p className="text-xs text-slate-500">
                Xếp hạng tích luỹ toàn thể khách mời tham gia ngày vui
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* My Rank Highlight Bar */}
        {myEntry && (
          <div className="px-6 py-2.5 bg-rose-500 text-white flex items-center justify-between text-xs font-bold shadow-inner">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
              <span>Thứ hạng của bạn: #{myRank > 0 ? myRank : '-'}</span>
              <span className="opacity-80">({myEntry.name})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded-full">{myEntry.title}</span>
              <span>{myEntry.score} 💗</span>
            </div>
          </div>
        )}

        {/* Tab Filters */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-2 overflow-x-auto text-xs font-bold">
          {[
            { id: 'all', label: 'Toàn Tiệc' },
            { id: 'hall', label: 'Sảnh Này' },
            { id: 'groom', label: 'Nhà Trai' },
            { id: 'bride', label: 'Nhà Gái' },
            { id: 'friends', label: 'Bạn Bè' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`py-3 px-3.5 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'text-rose-600 border-b-2 border-rose-500 font-extrabold bg-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Ranking List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[440px]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Trophy className="w-10 h-10 mx-auto text-amber-200 mb-2" />
              <p className="text-sm">Chưa có dữ liệu xếp hạng trong mục này</p>
            </div>
          ) : (
            filtered.map((entry, idx) => {
              const isMe = entry.uid === currentUid;
              const medal =
                idx === 0
                  ? '🥇'
                  : idx === 1
                  ? '🥈'
                  : idx === 2
                  ? '🥉'
                  : `#${idx + 1}`;

              const groupBadge =
                entry.group === 'groom'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : entry.group === 'bride'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <div
                  key={entry.uid}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                    isMe
                      ? 'border-rose-400 bg-rose-50/70 shadow-md ring-2 ring-rose-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-center font-extrabold text-base">
                      {medal}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">
                          {entry.name}
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold">
                            Bạn
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${groupBadge}`}>
                          {entry.group === 'groom' ? 'Nhà trai' : entry.group === 'bride' ? 'Nhà gái' : 'Bạn bè'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-amber-600 font-semibold">{entry.title}</span>
                        {entry.hallName && <span>• {entry.hallName}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-extrabold text-rose-600 text-sm">
                      {entry.score} 💗
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
