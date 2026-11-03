export interface ShopItem {
  id: string;
  name: string;
  category: 'flower' | 'outfit' | 'accessory';
  gender?: 'male' | 'female' | 'all';
  price: number;
  description: string;
  icon: string;
}

export const FLOWER_ITEMS: ShopItem[] = [
  {
    id: 'rose',
    name: 'Đoá hồng tình yêu',
    category: 'flower',
    price: 10,
    description: 'Bông hồng đỏ thắm gửi trọn tình cảm ấm áp',
    icon: '🌹',
  },
  {
    id: 'hydrangea',
    name: 'Bó cẩm tú cầu dịu dàng',
    category: 'flower',
    price: 30,
    description: 'Biểu tượng của sự thấu hiểu và chân thành',
    icon: '💐',
  },
  {
    id: 'basket',
    name: 'Lẵng hoa chúc phúc lớn',
    category: 'flower',
    price: 80,
    description: 'Lẵng hoa tươi sang trọng đặt ngay trước sân khấu',
    icon: '🧺',
  },
  {
    id: 'car',
    name: 'Xe hoa hạnh phúc mini',
    category: 'flower',
    price: 200,
    description: 'Xe hoa kết đầy hồng phấn đón mừng ngày vui',
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
