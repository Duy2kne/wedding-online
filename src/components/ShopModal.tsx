import React, { useState } from 'react';
import { X, Heart, Sparkles, Check, ShoppingBag, Gift } from 'lucide-react';
import { FLOWER_ITEMS, OUTFIT_ITEMS, type ShopItem } from '../shared/shop.js';
import type { UserData } from '../shared/types.js';

interface ShopModalProps {
  user: UserData;
  onClose: () => void;
  onGiftFlower: (flowerId: string) => void;
  onBuyOutfit: (itemId: string) => void;
  onEquipItem: (itemId: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  user,
  onClose,
  onGiftFlower,
  onBuyOutfit,
  onEquipItem,
}) => {
  const [tab, setTab] = useState<'flowers' | 'wardrobe'>('flowers');

  const filteredOutfits = OUTFIT_ITEMS.filter(
    (item) => item.gender === user.gender || item.gender === 'all'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden text-slate-800">
        {/* Header with Balance */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-rose-900 font-serif flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-rose-500" />
              <span>Tiệm Hỷ Cưới &amp; Tủ Đồ</span>
            </h2>
            <p className="text-xs text-slate-500">
              Dùng điểm Hỷ tặng quà chúc phúc cho Duy &amp; Tâm hoặc diện đồ mới
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Score Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-rose-500 text-white shadow-md font-extrabold text-sm">
              <Heart className="w-4 h-4 fill-white animate-pulse" />
              <span>{user.availableScore}</span>
              <span className="text-[10px] opacity-80">💗 Khả dụng</span>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setTab('flowers')}
            className={`flex-1 py-3 text-center text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === 'flowers'
                ? 'text-rose-600 border-b-2 border-rose-500 bg-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Tặng Quà Cô Dâu Chú Rể</span>
          </button>
          <button
            onClick={() => setTab('wardrobe')}
            className={`flex-1 py-3 text-center text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === 'wardrobe'
                ? 'text-rose-600 border-b-2 border-rose-500 bg-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Tủ Quần Áo &amp; Phụ Kiện</span>
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'flowers' ? (
            <div>
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                🎁 Quà bạn tặng sẽ xuất hiện ngay dưới chân sân khấu (2 bên thảm đỏ) kèm tên bạn trong 30 phút, đồng thời thông báo toàn tiệc để mọi người cùng chung vui!
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {FLOWER_ITEMS.map((item) => {
                  const canAfford = user.availableScore >= item.price;
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border-2 border-rose-100 bg-white hover:border-rose-300 shadow-sm flex flex-col justify-between transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-3xl">{item.icon}</span>
                          <span className="font-extrabold text-sm text-rose-600 flex items-center gap-1">
                            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                            {item.price} 💗
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm mt-1">{item.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                      </div>

                      <button
                        onClick={() => onGiftFlower(item.id)}
                        disabled={!canAfford}
                        className={`mt-4 w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          canAfford
                            ? 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>{canAfford ? 'Tặng Ngay Lên Sân Khấu' : 'Chưa đủ điểm Hỷ'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredOutfits.map((item) => {
                  const isFree = item.price === 0;
                  const isOwned = isFree || user.purchasedItems.includes(item.id);
                  const isEquipped =
                    user.equippedOutfit === item.id ||
                    user.equippedAccessories.includes(item.id);
                  const canAfford = user.availableScore >= item.price;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                        isEquipped
                          ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-rose-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-3xl">{item.icon}</span>
                          <span className="font-extrabold text-xs text-slate-700">
                            {isFree ? (
                              <span className="text-emerald-600 font-bold">Miễn phí</span>
                            ) : (
                              <span className="text-rose-600 font-bold flex items-center gap-1">
                                <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                                {item.price} 💗
                              </span>
                            )}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm mt-1">{item.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                      </div>

                      <div className="mt-4">
                        {isEquipped ? (
                          <button
                            onClick={() => onEquipItem(item.id)}
                            className="w-full py-2 rounded-xl font-bold text-xs bg-emerald-600 text-white flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Đang Mặc</span>
                          </button>
                        ) : isOwned ? (
                          <button
                            onClick={() => onEquipItem(item.id)}
                            className="w-full py-2 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <span>Mặc Vào</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onBuyOutfit(item.id)}
                            disabled={!canAfford}
                            className={`w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                              canAfford
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md hover:from-rose-600 hover:to-pink-600 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <span>{canAfford ? 'Mua Ngay' : 'Chưa đủ điểm'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
