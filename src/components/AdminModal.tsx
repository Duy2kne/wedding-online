import React, { useState } from 'react';
import { X, Shield, Sparkles, RefreshCw, Trash2, Download, Video, Award, Users } from 'lucide-react';
import type { WishItem, HallInfo } from '../shared/types.js';

interface AdminModalProps {
  wishes: WishItem[];
  halls: HallInfo[];
  onlineCount: number;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  wishes,
  halls,
  onlineCount,
  onClose,
  onRefreshData,
}) => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [videoStatus, setVideoStatus] = useState<string>('Đang kiểm tra...');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsAuthenticated(true);
        setErrorMsg('');
        checkHealth();
      } else {
        setErrorMsg('Mật khẩu quản trị không đúng!');
      }
    } catch {
      setErrorMsg('Không thể kết nối máy chủ!');
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      setVideoStatus(data.video === 'ok' ? '✅ Hoạt động tốt' : data.video);
    } catch {}
  };

  const executeAdminAction = async (action: string, payload?: any) => {
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action, payload }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMsg(data.message || 'Thao tác thành công!');
        setTimeout(() => setStatusMsg(''), 4000);
        if (onRefreshData) onRefreshData();
      } else {
        setErrorMsg(data.error || 'Thao tác thất bại');
      }
    } catch {
      setErrorMsg('Lỗi gửi lệnh quản trị');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in text-slate-800">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold font-serif">
              Bảng Điều Khiển Quản Trị Hôn Lễ (/admin)
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isAuthenticated ? (
          /* Password Authentication Form */
          <form onSubmit={handleLogin} className="p-8 flex flex-col items-center max-w-sm mx-auto w-full">
            <div className="p-4 rounded-full bg-rose-100 text-rose-600 mb-4">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-base mb-1">Xác thực quyền quản trị</h3>
            <p className="text-xs text-slate-500 text-center mb-4">
              Nhập mật khẩu quản trị để điều khiển hiệu ứng sảnh tiệc và quản lý lời chúc
            </p>

            <input
              type="password"
              placeholder="Nhập ADMIN_PASSWORD..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 focus:border-rose-500 outline-none text-sm mb-3"
            />

            {errorMsg && <p className="text-xs text-rose-600 font-bold mb-3">{errorMsg}</p>}

            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-md"
            >
              Đăng Nhập Quản Trị
            </button>
          </form>
        ) : (
          /* Admin Dashboard Content */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {statusMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold text-center">
                {statusMsg}
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-center">
                <span className="text-xs text-rose-600 font-bold">Khách Online</span>
                <p className="text-2xl font-extrabold text-rose-900 mt-0.5">{onlineCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                <span className="text-xs text-amber-700 font-bold">Tổng Lời Chúc</span>
                <p className="text-2xl font-extrabold text-amber-900 mt-0.5">{wishes.length}</p>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-center">
                <span className="text-xs text-blue-600 font-bold">Trạng Thái Video</span>
                <p className="text-xs font-extrabold text-blue-900 mt-2 truncate">{videoStatus}</p>
              </div>
            </div>

            {/* Event Action Controls */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Hiệu Ứng &amp; Hoạt Động Toàn Sảnh
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={() => executeAdminAction('toss_bouquet')}
                  className="p-3 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs flex flex-col items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span className="text-xl">💐</span>
                  <span>Tung Hoa Cưới</span>
                </button>

                <button
                  onClick={() => executeAdminAction('fireworks')}
                  className="p-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex flex-col items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Bắn Pháo Hoa</span>
                </button>

                <button
                  onClick={() => executeAdminAction('reset_video')}
                  className="p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex flex-col items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Phát Lại Video</span>
                </button>

                <button
                  onClick={() => executeAdminAction('announce_winner')}
                  className="p-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex flex-col items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Award className="w-5 h-5" />
                  <span>Vinh Danh TOP 3</span>
                </button>
              </div>
            </div>

            {/* Hall Occupancy & Dynamic Halls Status */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Tình Trạng Sảnh Tiệc
              </h4>
              <div className="space-y-2">
                {halls.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{h.name}</span>
                      <span className="ml-2 text-slate-500">({h.theme})</span>
                      {h.isCustom && <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">Mở tự động</span>}
                    </div>
                    <span className="font-semibold text-slate-700">
                      {h.playerCount}/{h.maxPlayers} khách
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wish Moderation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kiểm Duyệt Lời Chúc ({wishes.length})
                </h4>
                <a
                  href="/api/wishes/export.csv"
                  download="loi-chuc-cuoi-duy-tam.csv"
                  className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải .CSV
                </a>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-2xl p-2 bg-slate-50">
                {wishes.slice().reverse().map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="pr-2 truncate">
                      <span className="font-bold text-slate-800">{w.author}: </span>
                      <span className="text-slate-600">{w.content}</span>
                    </div>
                    <button
                      onClick={() => executeAdminAction('delete_wish', { wishId: w.id })}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Xoá lời chúc"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
