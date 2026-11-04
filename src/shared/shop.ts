export interface ShopItem {
  id: string;
  name: string;
  category: 'flower' | 'outfit' | 'accessory';
  gender?: 'male' | 'female' | 'all';
  price: number;
  description: string;
  icon: string;
}

// Quà tặng cô dâu chú rể: xuất hiện dưới chân sân khấu (2 bên thảm đỏ) kèm tên người tặng trong 30 phút.
// (giữ category 'flower' để tương thích dữ liệu cũ)
export const FLOWER_ITEMS: ShopItem[] = [
  {
    id: 'rose',
    name: 'Bình hoa hồng tình yêu',
    category: 'flower',
    price: 10,
    description: 'Bình hồng đỏ thắm gửi trọn tình cảm ấm áp',
    icon: '🌹',
  },
  {
    id: 'envelope',
    name: 'Phong bì mừng cưới',
    category: 'flower',
    price: 20,
    description: 'Phong bì đỏ thật to, "ít lòng thành" chúc trăm năm hạnh phúc',
    icon: '🧧',
  },
  {
    id: 'hydrangea',
    name: 'Chậu cẩm tú cầu dịu dàng',
    category: 'flower',
    price: 30,
    description: 'Biểu tượng của sự thấu hiểu và chân thành',
    icon: '💐',
  },
  {
    id: 'noodles',
    name: 'Thùng mì tôm cứu đói',
    category: 'flower',
    price: 30,
    description: 'Phòng khi cuối tháng vợ chồng son hết tiền đi chợ',
    icon: '🍜',
  },
  {
    id: 'diapers',
    name: 'Bịch tã em bé',
    category: 'flower',
    price: 40,
    description: 'Chuẩn bị trước cho chắc, chúc hai bạn sớm có tin vui',
    icon: '👶',
  },
  {
    id: 'detergent',
    name: 'Thùng bột giặt OMO',
    category: 'flower',
    price: 40,
    description: 'Chúc chồng chăm giặt đồ cho vợ, áo quần luôn thơm tho',
    icon: '🧺',
  },
  {
    id: 'piggy',
    name: 'Heo đất tiết kiệm',
    category: 'flower',
    price: 50,
    description: 'Chúc hai bạn tích góp mau mua nhà mua xe',
    icon: '🐷',
  },
  {
    id: 'gift_box',
    name: 'Hộp quà bí mật',
    category: 'flower',
    price: 50,
    description: 'Bên trong là gì thì cô dâu chú rể tự mở nhé',
    icon: '🎁',
  },
  {
    id: 'teddy',
    name: 'Gấu bông khổng lồ',
    category: 'flower',
    price: 60,
    description: 'Ôm gấu cho ấm, mai mốt nhường lại cho em bé',
    icon: '🧸',
  },
  {
    id: 'rice_cooker',
    name: 'Nồi cơm điện',
    category: 'flower',
    price: 70,
    description: 'Món quà quốc dân, chúc nhà luôn ấm cơm',
    icon: '🍚',
  },
  {
    id: 'washing_machine',
    name: 'Máy giặt cửa trước',
    category: 'flower',
    price: 90,
    description: 'Từ nay khỏi giành nhau giặt đồ, chúc nhà luôn thơm tho',
    icon: '🫧',
  },
  {
    id: 'car',
    name: 'Xe hoa hạnh phúc',
    category: 'flower',
    price: 100,
    description: 'Xe hoa trắng kết hoa hồng, đỗ ngay dưới sân khấu',
    icon: '🚗',
  },
];

export const OUTFIT_ITEMS: ShopItem[] = [
  // Free Male Outfits
  {
    id: 'suit_black',
    name: 'Vest Đen Lịch Lãm',
    category: 'outfit',
    gender: 'male',
    price: 0,
    description: 'Trang phục chú rể / quý ông trang trọng cổ điển',
    icon: '👔',
  },
  {
    id: 'suit_navy',
    name: 'Vest Xanh Navy',
    category: 'outfit',
    gender: 'male',
    price: 0,
    description: 'Hiện đại, thanh lịch và cuốn hút',
    icon: '🤵',
  },
  {
    id: 'ao_dai_male',
    name: 'Áo Dài Nam Truyền Thống',
    category: 'outfit',
    gender: 'male',
    price: 0,
    description: 'Nét đẹp văn hóa truyền thống ngày cưới Việt Nam',
    icon: '👘',
  },
  // Premium Male Outfits
  {
    id: 'suit_white',
    name: 'Vest Trắng Hoàng Gia',
    category: 'outfit',
    gender: 'male',
    price: 100,
    description: 'Bộ vest trắng ngà tinh khôi nổi bật giữa sảnh tiệc',
    icon: '✨',
  },
  {
    id: 'suit_burgundy',
    name: 'Vest Nhung Đỏ Đô',
    category: 'outfit',
    gender: 'male',
    price: 150,
    description: 'Chất liệu nhung cao cấp sắc đỏ hỷ may mắn',
    icon: '🍷',
  },
  {
    id: 'ao_dai_silk',
    name: 'Áo Dài Gấm Thêu Rồng',
    category: 'outfit',
    gender: 'male',
    price: 150,
    description: 'Gấm thượng hạng thêu chỉ vàng quý phái',
    icon: '🐉',
  },
  {
    id: 'bowtie_gold',
    name: 'Nơ Bướm Vàng Champagne',
    category: 'accessory',
    gender: 'male',
    price: 40,
    description: 'Điểm nhấn lấp lánh cho cổ áo',
    icon: '🎀',
  },

  // Free Female Outfits
  {
    id: 'dress_pink',
    name: 'Váy Dạ Hội Hồng Phấn',
    category: 'outfit',
    gender: 'female',
    price: 0,
    description: 'Nhẹ nhàng, thướt tha tông màu ngọt ngào',
    icon: '👗',
  },
  {
    id: 'ao_dai_red',
    name: 'Áo Dài Đỏ Tươi',
    category: 'outfit',
    gender: 'female',
    price: 0,
    description: 'Rực rỡ, may mắn và duyên dáng nét xuân',
    icon: '🏮',
  },
  {
    id: 'dress_cream',
    name: 'Đầm Trắng Kem Tinh Khôi',
    category: 'outfit',
    gender: 'female',
    price: 0,
    description: 'Vẻ đẹp thanh khiết tựa sương mai',
    icon: '🤍',
  },
  // Premium Female Outfits
  {
    id: 'dress_princess',
    name: 'Đầm Công Chúa Xòe Bồng',
    category: 'outfit',
    gender: 'female',
    price: 150,
    description: 'Thiết kế lộng lẫy đính sequin lấp lánh như cổ tích',
    icon: '👑',
  },
  {
    id: 'ao_dai_phoenix',
    name: 'Áo Dài Cưới Thêu Phượng',
    category: 'outfit',
    gender: 'female',
    price: 200,
    description: 'Áo dài lụa tơ tằm thêu chim phượng hoàng rực rỡ',
    icon: '🦚',
  },
  {
    id: 'flower_crown',
    name: 'Vương Miện Hoa Tươi',
    category: 'accessory',
    gender: 'female',
    price: 60,
    description: 'Vòng hoa baby và hồng phấn cài mái tóc',
    icon: '🌸',
  },
  {
    id: 'veil',
    name: 'Khăn Voan Cưới Bay Bổng',
    category: 'accessory',
    gender: 'female',
    price: 60,
    description: 'Khăn voan mỏng manh thêu hoa tuyết',
    icon: '👰',
  },

  // Shared Accessories
  {
    id: 'sunglasses',
    name: 'Kính Râm Thời Thượng',
    category: 'accessory',
    gender: 'all',
    price: 30,
    description: 'Kính mát đen cực ngầu khi nâng ly',
    icon: '🕶️',
  },
  {
    id: 'heart_halo',
    name: 'Vòng Hào Quang Trái Tim',
    category: 'accessory',
    gender: 'all',
    price: 300,
    description: 'Vòng hào quang trái tim hồng phát sáng lơ lửng trên đầu',
    icon: '💖',
  },
  {
    id: 'petals_aura',
    name: 'Hào Quang Cánh Hoa Rơi',
    category: 'accessory',
    gender: 'all',
    price: 250,
    description: 'Những cánh hoa hồng nhẹ nhàng xoay quanh bước chân',
    icon: '🌺',
  },
];

export const ALL_SHOP_ITEMS: ShopItem[] = [...FLOWER_ITEMS, ...OUTFIT_ITEMS];

export function getUserTitle(cumulativeScore: number): string {
  if (cumulativeScore >= 300) return 'Người nhà';
  if (cumulativeScore >= 150) return 'Khách VIP';
  if (cumulativeScore >= 50) return 'Bạn thân';
  return 'Khách mời';
}
