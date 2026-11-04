import React, { useState } from 'react';
import { X, Shield, Sparkles, RefreshCw, Trash2, Download, Award, Search, Heart } from 'lucide-react';
import type { WishItem, HallInfo } from '../shared/types.js';

interface AdminUser {
  uid: string;
  name: string;
  group: 'groom' | 'bride' | 'friends';
  cumulativeScore: number;
  availableScore: number;
  isOnline: boolean;
}

const GROUP_LABEL: Record<string, string> = { groom: 'Nhà trai', bride: 'Nhà gái', friends: 'Bạn bè' };

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
  // Cộng / trừ điểm cho khách
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [customAmount, setCustomAmount] = useState<Record<string, string>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const callAdmin = async (action: string, payload?: any) => {
    const res = await fetch('/api/admin/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action, payload }),
    });
    return res.json();
  };

  const loadUsers = async () => {
    try {
      const data = await callAdmin('list_users');
      if (data.ok) setUsers(data.users);
    } catch {}
  };

  const adjustScore = async (u: AdminUser, delta: number) => {
    if (!Number.isFinite(delta) || delta === 0 || busyUid) return;
    setBusyUid(u.uid);
    setErrorMsg('');
    try {
      const data = await callAdmin('adjust_score', { uid: u.uid, delta, reason: reason.trim() });
      if (data.ok) {
        setUsers((list) =>
          list.map((x) => (x.uid === u.uid ? { ...x, cumulativeScore: data.user.cumulativeScore, availableScore: data.user.availableScore } : x))
        );
        setCustomAmount((m) => ({ ...m, [u.uid]: '' }));
        setStatusMsg(data.message);
        setTimeout(() => setStatusMsg(''), 4000);
      } else {
        setErrorMsg(data.error || 'Không cộng được điểm');
      }
    } catch {
      setErrorMsg('Lỗi gửi lệnh quản trị');
    } finally {
      setBusyUid(null);
    }
  };

  const keyword = search.trim().toLowerCase();
  const filteredUsers = keyword ? users.filter((u) => u.name.toLowerCase().includes(keyword)) : users;

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
        loadUsers();
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
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-xs font-bold text-center">
                {errorMsg}
              </div>
            )}
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

            {/* Cộng / trừ điểm Hỷ cho khách */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  Cộng / Trừ Điểm Hỷ ({users.length} khách)
                </h4>
                <button
                  onClick={loadUsers}
                  className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tải lại
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm tên khách..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl border-2 border-slate-200 focus:border-rose-400 outline-none text-xs"
                  />
                </div>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={80}
                  placeholder="Lý do (tuỳ chọn), vd: Thắng mini game tại tiệc"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-rose-400 outline-none text-xs"
                />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 rounded-2xl p-2 bg-slate-50">
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">
                    {users.length === 0 ? 'Chưa có khách nào vào tiệc.' : 'Không tìm thấy khách nào.'}
                  </p>
                )}
                {filteredUsers.map((u) => {
                  const busy = busyUid === u.uid;
                  const amount = customAmount[u.uid] ?? '';
                  return (
                    <div
                      key={u.uid}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-[150px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${u.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={u.isOnline ? 'Đang online' : 'Đã rời tiệc'}
                          />
                          <span className="font-bold text-slate-800 break-all">{u.name}</span>
                        </div>
                        <span className="text-slate-500">
                          {GROUP_LABEL[u.group] || 'Khách'} · <b className="text-rose-600">{u.cumulativeScore} 💗</b>
                          {u.availableScore !== u.cumulativeScore && <> (còn tiêu được {u.availableScore})</>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {[10, 50, 100].map((n) => (
                          <button
                            key={n}
                            disabled={busy}
                            onClick={() => adjustScore(u, n)}
                            className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold disabled:opacity-50 cursor-pointer"
                          >
                            +{n}
                          </button>
                        ))}
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            adjustScore(u, Math.trunc(Number(amount)));
                          }}
                        >
                          <input
                            type="number"
                            inputMode="numeric"
                            value={amount}
                            onChange={(e) => setCustomAmount((m) => ({ ...m, [u.uid]: e.target.value }))}
                            placeholder="±điểm"
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 focus:border-rose-400 outline-none"
                          />
                          <button
                            type="submit"
                            disabled={busy || !amount || Number(amount) === 0}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold disabled:opacity-40 cursor-pointer"
                          >
                            {Number(amount) < 0 ? 'Trừ' : 'Cộng'}
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Nhập số âm (vd: -20) để trừ điểm. Khách đang online nhận thông báo ngay; bảng vàng cập nhật tức thì.
              </p>
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
