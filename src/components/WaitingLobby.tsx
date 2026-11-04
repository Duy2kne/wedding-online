import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Sparkles, Users, Crown, Heart, ChevronRight, Music, Volume2, Shield } from 'lucide-react';
import type { WeddingConfig, HallInfo, GuestGroup, Gender } from '../shared/types.js';
import { OUTFIT_ITEMS } from '../shared/shop.js';
import { Character3D } from '../scene/character3D.js';

interface WaitingLobbyProps {
  config: WeddingConfig;
  halls: HallInfo[];
  onJoin: (data: {
    name: string;
    group: GuestGroup;
    gender: Gender;
    hairStyle: number;
    hairColor: string;
    outfit: string;
    preferredHall: string;
  }) => void;
  onOpenAdmin: () => void;
}

export const WaitingLobby: React.FC<WaitingLobbyProps> = ({
  config,
  halls,
  onJoin,
  onOpenAdmin,
}) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<GuestGroup>('friends');
  const [gender, setGender] = useState<Gender>('female');
  const [hairStyle, setHairStyle] = useState(0);
  const [hairColor, setHairColor] = useState('#3d2314');
  const [selectedOutfit, setSelectedOutfit] = useState('dress_pink');
  const [selectedHall, setSelectedHall] = useState(halls[0]?.id || 'diamond');
  const [countdown, setCountdown] = useState('');

  // 3D Preview Canvas for Character
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load from localStorage if previously entered
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('wedding_guest_name');
      if (savedName) setName(savedName);
      const savedGroup = localStorage.getItem('wedding_guest_group') as GuestGroup;
      if (savedGroup) setGroup(savedGroup);
      const savedGender = localStorage.getItem('wedding_guest_gender') as Gender;
      if (savedGender) {
        setGender(savedGender);
        setSelectedOutfit(savedGender === 'male' ? 'suit_black' : 'dress_pink');
      }
    } catch {}
  }, []);

  // Update outfit when gender changes
  const handleGenderChange = (newGender: Gender) => {
    setGender(newGender);
    setSelectedOutfit(newGender === 'male' ? 'suit_black' : 'dress_pink');
  };

  // Countdown clock to 18:00 29/11/2026
  useEffect(() => {
    const updateCountdown = () => {
      const targetDate = new Date(`${config.date}T${config.time}:00+07:00`).getTime();
      const diff = targetDate - Date.now();
      if (diff <= 0) {
        setCountdown('💍 Tiệc đang diễn ra');
      } else {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        setCountdown(`còn ${d} ngày ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [config]);

  // 3D Character Preview Canvas setup
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(220, 260);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 220 / 260, 0.1, 20);
    camera.position.set(0, 1.1, 3.2);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    camera.position.set(0, 1.05, 4.2);
    camera.lookAt(0, 0.82, 0);
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a6a50, 1.2));
    const dirLight = new THREE.DirectionalLight(0xfff1e6, 1.8);
    dirLight.position.set(2, 4, 4);
    scene.add(dirLight);

    // Dùng đúng nhân vật trong sảnh để xem trước
    const preview = new Character3D(
      {
        id: 'preview',
        uid: 'preview',
        name: name.trim() || 'Bạn',
        group,
        gender,
        hairStyle,
        hairColor,
        outfit: selectedOutfit,
        accessories: [],
        position: [0, 0, 0],
        rotation: 0.35,
        action: 'idle',
        hallId: 'preview',
      },
      true,
      { showNameplate: false, castShadow: false }
    );
    const charGroup = preview.group;
    scene.add(charGroup);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      charGroup.rotation.y += 0.012; // xoay chậm để xem trang phục
      preview.update(1 / 60);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      preview.dispose();
      renderer.dispose();
    };
  }, [gender, selectedOutfit, hairStyle, hairColor, group]);

  // Quick join: picks fullest hall with available spot
  const handleQuickJoin = () => {
    let bestHall = halls[0]?.id || 'diamond';
    let maxCount = -1;
    for (const h of halls) {
      if (h.playerCount < h.maxPlayers && h.playerCount > maxCount) {
        maxCount = h.playerCount;
        bestHall = h.id;
      }
    }
    handleSubmit(bestHall);
  };

  const handleSubmit = (targetHall = selectedHall) => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert('Vui lòng nhập tên của bạn để dự tiệc nhé!');
      return;
    }

    try {
      localStorage.setItem('wedding_guest_name', trimmed);
      localStorage.setItem('wedding_guest_group', group);
      localStorage.setItem('wedding_guest_gender', gender);
    } catch {}

    onJoin({
      name: trimmed,
      group,
      gender,
      hairStyle,
      hairColor,
      outfit: selectedOutfit,
      preferredHall: targetHall,
    });
  };

  const availableOutfits = OUTFIT_ITEMS.filter(
    (i) => i.category === 'outfit' && (i.gender === gender || i.gender === 'all')
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto bg-slate-900"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(42,26,30,0.55), rgba(42,26,30,0.75)), url(/media/photos/anh01.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 35%',
      }}
    >
      {/* Wedding Invitation Card */}
      <div className="relative w-full max-w-4xl my-auto overflow-hidden bg-white/95 rounded-3xl shadow-2xl border-4 border-amber-300/80 text-slate-800">
        {/* Decorative corner ribbons */}
        <div className="absolute top-0 right-0 w-32 h-32 overflow-hidden pointer-events-none">
          <div className="absolute transform rotate-45 bg-rose-600 text-white text-xs font-bold py-1 right-[-35px] top-[32px] w-[170px] text-center shadow-md">
            29.11.2026
          </div>
        </div>

        {/* Header Banner */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-rose-100 bg-gradient-to-r from-rose-50 via-amber-50/50 to-pink-50">
          <p className="text-xs tracking-widest text-rose-600 uppercase font-semibold">
            Thư Mời Tham Dự Tiệc Cưới Trực Tuyến 3D
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-extrabold text-rose-900 tracking-tight font-serif">
            {config.groom} <span className="text-rose-500 font-normal">♥</span> {config.bride}
          </h1>
          <p className="mt-1 text-sm text-slate-600 italic">
            "{config.welcome}"
          </p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100/90 text-rose-800 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-spin" />
            <span>{countdown}</span>
          </div>
        </div>

        {/* Content Body: Left Column (3D Character Preview) & Right Column (Guest Details) */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Character 3D Preview */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-rose-50/60 to-purple-50/60 border border-rose-200/60 shadow-inner">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Xem Trước Nhân Vật 3D
            </h3>
            <div className="relative w-[220px] h-[260px] rounded-xl overflow-hidden bg-white/70 shadow-sm border border-rose-100 flex items-center justify-center">
              <canvas ref={previewCanvasRef} width={220} height={260} className="w-full h-full cursor-grab active:cursor-grabbing" />
              <span className="absolute bottom-1 text-[11px] text-slate-400 bg-white/80 px-2 py-0.5 rounded-full">
                Xoay 360°
              </span>
            </div>

            {/* Gender Toggle */}
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={() => handleGenderChange('male')}
                className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
                  gender === 'male'
                    ? 'bg-blue-600 text-white shadow-blue-200'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                🤵 Nam
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange('female')}
                className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
                  gender === 'female'
                    ? 'bg-rose-500 text-white shadow-rose-200'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                👰 Nữ
              </button>
            </div>
          </div>

          {/* Form Options */}
          <div className="md:col-span-8 flex flex-col justify-between space-y-4">
            {/* Guest Name & Relationship */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên của bạn <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập họ tên / biệt danh..."
                  className="w-full px-3.5 py-2 rounded-xl border-2 border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none font-semibold text-slate-800 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Bạn là khách của:
                </label>
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value as GuestGroup)}
                  className="w-full px-3.5 py-2 rounded-xl border-2 border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none font-semibold text-slate-800 transition-all text-sm bg-white"
                >
                  <option value="groom">Nhà trai (Chú rể Hoàng Duy)</option>
                  <option value="bride">Nhà gái (Cô dâu Thiều Tâm)</option>
                  <option value="friends">Bạn bè chung / Đồng nghiệp</option>
                </select>
              </div>
            </div>

            {/* Hair Style & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Kiểu tóc:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setHairStyle(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        hairStyle === s
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Kiểu {s + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Màu tóc:
                </label>
                <div className="flex gap-2 items-center">
                  {['#1c1512', '#3d2314', '#6b3a22', '#9a6a3c'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setHairColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        hairColor === c ? 'scale-110 border-rose-500 shadow-md ring-2 ring-rose-300' : 'border-white'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Outfits Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Chọn trang phục ban đầu:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {availableOutfits.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedOutfit(item.id)}
                    className={`p-2 rounded-xl text-left border-2 transition-all flex flex-col justify-between ${
                      selectedOutfit === item.id
                        ? 'border-rose-500 bg-rose-50/80 shadow-sm'
                        : 'border-slate-200 hover:border-rose-200 bg-white'
                    }`}
                  >
                    <div className="text-lg">{item.icon}</div>
                    <div className="text-xs font-bold text-slate-800 truncate mt-1">{item.name}</div>
                    <div className="text-[10px] text-emerald-600 font-semibold">Miễn phí</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Hall Selection Cards */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Chọn sảnh tiệc:
                </label>
                <button
                  type="button"
                  onClick={handleQuickJoin}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Vào nhanh sảnh đông nhất
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {halls.map((h) => {
                  const isFull = h.playerCount >= h.maxPlayers;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => !isFull && setSelectedHall(h.id)}
                      disabled={isFull}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                        selectedHall === h.id
                          ? 'border-rose-500 bg-rose-50/80 shadow-sm'
                          : isFull
                          ? 'opacity-60 bg-slate-100 border-slate-200 cursor-not-allowed'
                          : 'border-slate-200 hover:border-rose-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800 truncate">
                          {h.theme === 'diamond' ? '💎 ' : '🌸 '}
                          {h.name}
                        </span>
                        {isFull && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            Đã đủ
                          </span>
                        )}
                      </div>
                      {/* Occupancy bar */}
                      <div className="mt-1.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isFull ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, (h.playerCount / h.maxPlayers) * 100)}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                        <span>{h.theme === 'diamond' ? 'Ngà & champagne' : 'Hồng phấn'}</span>
                        <span className="font-semibold text-slate-700">
                          {h.playerCount}/{h.maxPlayers} khách
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 hover:from-rose-700 hover:to-pink-600 text-white font-extrabold text-base shadow-lg shadow-rose-300/50 transition-all transform hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>💒 Vào dự tiệc cưới</span>
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={onOpenAdmin}
                title="Trang quản trị /admin"
                className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 transition-colors"
              >
                <Shield className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
