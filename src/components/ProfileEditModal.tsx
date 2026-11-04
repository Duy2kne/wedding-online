import React, { useState } from 'react';
import { X, UserCheck, Sparkles, Check } from 'lucide-react';
import type { UserData, GuestGroup, Gender } from '../shared/types.js';
import { OUTFIT_ITEMS } from '../shared/shop.js';

interface ProfileEditModalProps {
  user: UserData;
  onClose: () => void;
  onUpdateProfile: (data: {
    name: string;
    group: GuestGroup;
    gender: Gender;
    hairStyle: number;
    hairColor: string;
  }) => void;
  onEquipOutfit: (itemId: string) => void;
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  user,
  onClose,
  onUpdateProfile,
  onEquipOutfit,
}) => {
  const [name, setName] = useState(user.name);
  const [group, setGroup] = useState<GuestGroup>(user.group);
  const [gender, setGender] = useState<Gender>(user.gender);
  const [hairStyle, setHairStyle] = useState(user.hairStyle);
  const [hairColor, setHairColor] = useState(user.hairColor || '#3d2314');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onUpdateProfile({
      name: name.trim(),
      group,
      gender,
      hairStyle,
      hairColor,
    });
    onClose();
  };

  const unlockedOutfits = OUTFIT_ITEMS.filter(
    (item) =>
      (item.gender === gender || item.gender === 'all') &&
      (item.price === 0 || user.purchasedItems.includes(item.id))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-extrabold text-slate-800 font-serif">
              Chỉnh Sửa Thông Tin &amp; Diện Đồ
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Tên hiển thị:
            </label>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border-2 border-rose-200 focus:border-rose-500 outline-none text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nhóm khách:
              </label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as GuestGroup)}
                className="w-full px-3 py-2 rounded-xl border-2 border-rose-200 text-xs font-semibold bg-white"
              >
                <option value="groom">Nhà trai</option>
                <option value="bride">Nhà gái</option>
                <option value="friends">Bạn bè</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Giới tính:
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`flex-1 py-1.5 rounded-xl font-bold text-xs ${
                    gender === 'male' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Nam
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`flex-1 py-1.5 rounded-xl font-bold text-xs ${
                    gender === 'female' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Nữ
                </button>
              </div>
            </div>
          </div>

          {/* Hair Styles & Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Kiểu tóc:
              </label>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setHairStyle(s)}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold ${
                      hairStyle === s ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {s + 1}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Màu tóc:
              </label>
              <div className="flex gap-2 items-center">
                {['#1f2937', '#3d2314', '#7c2d12', '#b45309'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setHairColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 ${
                      hairColor === c ? 'scale-110 border-rose-500 ring-2 ring-rose-200' : 'border-white'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Wardrobe Quick Equip */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
              Trang phục đã mở khóa:
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
              {unlockedOutfits.map((item) => {
                const isEquipped =
                  user.equippedOutfit === item.id ||
                  user.equippedAccessories.includes(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onEquipOutfit(item.id)}
                    className={`p-2 rounded-xl border text-left flex flex-col items-center justify-center text-center transition-all ${
                      isEquipped
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200'
                        : 'border-slate-200 hover:border-rose-300 bg-white'
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-[11px] font-bold truncate w-full mt-1">{item.name}</span>
                    {isEquipped && <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer"
          >
            Lưu Thay Đổi
          </button>
        </form>
      </div>
    </div>
  );
};
