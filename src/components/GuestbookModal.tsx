import React, { useState } from 'react';
import { X, Send, Heart, Download, Filter } from 'lucide-react';
import type { WishItem, GuestGroup } from '../shared/types.js';

interface GuestbookModalProps {
  wishes: WishItem[];
  onClose: () => void;
  onSubmitWish: (content: string, icon: '💐' | '💍' | '🎉') => void;
}

export const GuestbookModal: React.FC<GuestbookModalProps> = ({
  wishes,
  onClose,
  onSubmitWish,
}) => {
  const [content, setContent] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<'💐' | '💍' | '🎉'>('💐');
  const [filterGroup, setFilterGroup] = useState<string>('all');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmitWish(content.trim(), selectedIcon);
    setContent('');
  };

  const filteredWishes = wishes.filter((w) => {
    if (filterGroup === 'all') return true;
    return w.group === filterGroup;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-200 overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-rose-900 font-serif flex items-center gap-2">
              <span>💌 Sổ Lưu Bút Chúc Phúc</span>
            </h2>
            <p className="text-xs text-slate-500">
              Gửi ngàn lời chúc trăm năm hạnh phúc tới Hoàng Duy & Thiều Tâm
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/wishes/export.csv"
              download="loi-chuc-cuoi-duy-tam.csv"
              title="Tải về file .csv"
              className="p-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Tải .CSV</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-4 bg-rose-50/50 border-b border-rose-100">
          <div className="flex gap-2 mb-2">
            {(['💐', '💍', '🎉'] as const).map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setSelectedIcon(ic)}
                className={`px-3 py-1.5 rounded-xl text-lg transition-all ${
                  selectedIcon === ic
                    ? 'bg-rose-500 text-white shadow-md scale-105'
                    : 'bg-white border border-rose-200 hover:bg-rose-100'
                }`}
              >
                {ic}
              </button>
            ))}
            <span className="text-xs text-slate-500 self-center ml-2">
              (Gửi lời chúc nhận ngay +5 💗 điểm Hỷ)
            </span>
          </div>

          <div className="flex gap-2">
            <textarea
              maxLength={200}
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập lời chúc tốt đẹp nhất gửi gắm đến cô dâu & chú rể..."
              className="flex-1 p-3 rounded-2xl border-2 border-rose-200 focus:border-rose-500 outline-none text-sm resize-none"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-5 py-2 bg-gradient-to-r from-rose-500 to-pink-500 disabled:opacity-50 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span className="text-xs">Gửi</span>
            </button>
          </div>
        </form>

        {/* Filters */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-bold">Lọc theo:</span>
          </div>
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'groom', label: 'Nhà trai' },
              { id: 'bride', label: 'Nhà gái' },
              { id: 'friends', label: 'Bạn bè' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterGroup(f.id)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterGroup === f.id
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Wishes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[450px]">
          {filteredWishes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Heart className="w-10 h-10 mx-auto text-rose-300 animate-pulse mb-2" />
              <p className="text-sm">Chưa có lời chúc nào trong mục này. Hãy là người đầu tiên gửi lời chúc nhé!</p>
            </div>
          ) : (
            filteredWishes
              .slice()
              .reverse()
              .map((w) => {
                const groupColor =
                  w.group === 'groom'
                    ? 'text-blue-600 bg-blue-50 border-blue-200'
                    : w.group === 'bride'
                    ? 'text-rose-600 bg-rose-50 border-rose-200'
                    : 'text-emerald-600 bg-emerald-50 border-emerald-200';
                const groupLabel =
                  w.group === 'groom' ? 'Nhà trai' : w.group === 'bride' ? 'Nhà gái' : 'Bạn bè';

                return (
                  <div
                    key={w.id}
                    className="p-3.5 rounded-2xl bg-white border border-rose-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{w.icon || '💐'}</span>
                        <span className="font-bold text-sm text-slate-800">{w.author}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${groupColor}`}>
                          {groupLabel}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(w.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap pl-7">{w.content}</p>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
