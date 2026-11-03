# 💒 Tiệc Cưới Online 3D Nhiều Người · Hoàng Duy ♥ Thiều Tâm

> **Ngày cưới:** 29/11/2026  
> **Không gian:** Sảnh Diamond 💎 & Sảnh Sophia 🌸 trực tuyến đa phòng, thời gian thực nhiều người cùng lúc.

---

## 🌟 Giới Thiệu Tính Năng

- **Không gian 3D sang trọng & lãng mạn:** Dựng hoàn toàn bằng Three.js, tối ưu hóa hiệu năng với `InstancedMesh`, tối đa 4 PointLight, đảm bảo đạt 60 FPS trên máy tính và ≥ 30 FPS trên điện thoại.
- **2 Sảnh tiệc độc đáo & mở rộng tự động:**
  - **Sảnh Diamond 💎:** Phong cách hiện đại sang trọng (trắng, bạc, xanh băng, đèn chùm pha lê, hoa hồng trắng & lan hồ điệp).
  - **Sảnh Sophia 🌸:** Phong cách lãng mạn ấm áp (hồng phấn, kem, vàng champagne, nến lung linh, rèm voan, hoa mẫu đơn).
  - Tự động mở thêm sảnh khi đông khách (lên tới 6 sảnh / 300 khách), có hàng chờ thông minh và chuyển sảnh trực tiếp không cần tải lại trang.
- **Nhân vật Chibi 3D dễ thương:** Tuỳ biến nam/nữ, kiểu tóc, màu tóc, bộ trang phục vest/áo dài truyền thống/váy dạ hội. Bảng tên phân biệt Nhà trai (xanh), Nhà gái (hồng), Bạn bè (xanh ngọc).
- **Video cưới màn hình LED lớn:** Chiếu video YouTube trực tiếp trên sân khấu 3D với công nghệ CSS3DRenderer và kỹ thuật đục lỗ WebGL (hole punch), nhân vật đi qua vẫn che video tự nhiên, hỗ trợ bật âm thanh khi đứng gần và đồng bộ mốc thời gian mọi sảnh.
- **Sổ lưu bút & Bảng lời chúc:** Gửi lời chúc kèm biểu tượng 💐💍🎉, bay lên bảng 3D cạnh sân khấu, lưu vĩnh viễn trên server và xuất file `.csv`.
- **Hệ thống Điểm Hỷ 💗 & Cửa Hàng:**
  - Chơi mini game (Ghép hình cưới, Lật thẻ trí nhớ, Đố vui tình yêu, Bắn tim, Hứng hoa cưới từ cô dâu) để tích lũy điểm Hỷ.
  - Tặng hoa chúc phúc đặt trực tiếp lên sân khấu (tồn tại 30 phút, tối đa 60 bó).
  - Tủ đồ mở khóa trang phục cao cấp và phụ kiện hào quang.
  - Bảng vàng vinh danh TOP 10 toàn tiệc, sảnh và nhóm khách.
- **Trang quản trị `/admin`:** Bảo vệ bằng mật khẩu `ADMIN_PASSWORD`, kích hoạt tung hoa, pháo hoa, vinh danh top 3, quản lý sảnh và kiểm duyệt lời chúc.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Trên Máy Tính (Local)

### 1. Yêu cầu hệ thống
- **Node.js** phiên bản 20 trở lên (`node -v`)
- **npm** phiên bản 10 trở lên (`npm -v`)

### 2. Cài đặt các thư viện
```bash
npm install
```

### 3. Chạy môi trường phát triển (Dev)
```bash
npm run dev
```
Trình duyệt sẽ mở tại `http://localhost:3000`.

### 4. Kiểm tra mã nguồn (Typecheck & Server bundling)
```bash
npm run check
```

### 5. Đóng gói cho Production
```bash
npm run build
npm start
```

---

## 🎨 Hướng Dẫn Tùy Chỉnh Nội Dung Cho Đám Cưới

Toàn bộ thông tin được tách biệt trong các file cấu hình và thư mục cố định, **không cần sửa code**:

### 1. Thông tin cô dâu, chú rể & ngày cưới
Mở file `public/wedding.config.json`:
```json
{
  "groom": "Hoàng Duy",
  "bride": "Thiều Tâm",
  "date": "2026-11-29",
  "time": "18:00",
  "venue": "Online · Sảnh Diamond & Sảnh Sophia",
  "welcome": "Cảm ơn bạn đã đến chung vui cùng Duy & Tâm 💕",
  "video": {
    "mode": "youtube",
    "youtubeId": "uIlNkfn6NcA"
  },
  "hashtag": "#DuyTamWedding"
}
```

### 2. Đổi Video Cưới YouTube
1. Tải video cưới của bạn lên **YouTube**.
2. Chọn quyền riêng tư là **"Không công khai" (Unlisted)** và đảm bảo đã bật **"Cho phép nhúng" (Allow embedding)**.
3. Lấy mã ID video (phần ký tự sau `youtu.be/` hoặc `v=`, ví dụ: `uIlNkfn6NcA`).
4. Dán mã vào `youtubeId` trong `public/wedding.config.json` rồi lưu lại.

### 3. Thêm Ảnh Cưới Cho Tường Ảnh & Trò Chơi
Thả các file ảnh `.jpg`, `.png`, hoặc `.webp` vào thư mục:
```
public/media/photos/
```
Hệ thống sẽ tự động quét và treo ảnh vào các khung mạ vàng quanh sảnh tiệc, đồng thời đưa ảnh vào trò ghép hình và lật thẻ trí nhớ.

### 4. Thêm Nhạc Cưới Tùy Chọn
Thả các file nhạc `.mp3` vào thư mục:
```
public/music/
```
Nếu chưa có file nhạc, trang web sẽ tự động phát bản nhạc piano & dây lãng mạn được tổng hợp trực tiếp bằng Web Audio API.

### 5. Đổi Câu Hỏi Đố Vui
Chỉnh sửa các câu trắc nghiệm tại file `public/quiz.json`.

---

## ☁️ Triển Khai Lên Render / VPS

### Triển khai lên Render (Gói Free hoặc Paid)
1. Đẩy mã nguồn lên repository GitHub của bạn:
   ```bash
   git add .
   git commit -m "feat: website tiệc cưới online 3D Duy & Tâm"
   git push origin main
   ```
2. Đăng nhập vào [Render.com](https://render.com) -> Chọn **New +** -> **Web Service** (hoặc chọn **Blueprint** để dùng file `render.yaml`).
3. Cấu hình:
   - **Environment:** Node
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Thêm các biến môi trường (Environment Variables):
   - `NODE_ENV=production`
   - `PORT=3000`
   - `ADMIN_PASSWORD=duytam2026` (hoặc mật khẩu tuỳ chọn)
   - `DATA_DIR=./data` *(Lưu ý: Nếu dùng gói Render Free, ổ đĩa tạm thời sẽ được reset khi restart. Để lưu vĩnh viễn lời chúc và điểm, bạn có thể gắn thêm Persistent Disk tại tab Disks trên Render)*.

### Triển khai bằng Docker
Dự án đã có sẵn `Dockerfile` multi-stage tối ưu và bảo mật:
```bash
docker build -t tiec-cuoi-duy-tam .
docker run -p 3000:3000 -e ADMIN_PASSWORD=duytam2026 tiec-cuoi-duy-tam
```

---

## 🔒 Kiểm Tra Sức Khỏe API & Quản Trị
- **Health Check:** `GET /health` trả về trạng thái máy chủ, số khách đang online, danh sách sảnh và kiểm tra nhúng video YouTube.
- **Trang Quản Trị:** Bấm biểu tượng chiếc khiên ở góc màn hình hoặc mở modal Admin, nhập mật khẩu quản trị (`duytam2026`).

---

💕 *Chúc mừng hạnh phúc Hoàng Duy & Thiều Tâm · 29.11.2026 · Trăm Năm Hạnh Phúc!*
