/*
 * Bảng màu 2 sảnh. Nguyên tắc: nền trung tính ấm (ngà, kem, be) chiếm phần lớn,
 * 1 màu nhấn trầm (đỏ rượu vang / hồng đất) và vàng champagne cho chi tiết kim loại.
 * Tránh trắng tinh (#fff) và màu bão hoà mạnh để sảnh không bị chói dưới đèn.
 */
export interface HallThemeConfig {
  id: 'diamond' | 'sophia';
  name: string;
  floorBase: string; // màu nền đá (canvas)
  floorVein: string; // vân đá
  floorGrout: string; // đường ron gạch
  wallColor: number;
  wainscotColor: number; // ốp chân tường
  ceilingColor: number;
  drapeColor: number; // rèm vải
  carpetColor: number;
  carpetBorderColor: number;
  ambientColor: number;
  ambientIntensity: number;
  primaryLightColor: number;
  accentLightColor: number;
  chairFrameColor: number;
  chairClothColor: number;
  chairBowColor: number;
  tableClothColor: number;
  tableOverlayColor: number;
  rugColor: string; // thảm tròn dưới bàn
  rugRing: string;
  curtainColor: number;
  flowerPalette: {
    primary: number;
    secondary: number;
    accent: number;
    leaf: number;
  };
  screenBg: string; // nền màn hình phụ (đếm ngược, bảng điểm)
  screenAccent: string;
  screenText: string;
  chandelierStyle: 'crystal' | 'fairy';
  description: string;
  badge: string;
}

export const HALL_THEMES: Record<'diamond' | 'sophia', HallThemeConfig> = {
  diamond: {
    id: 'diamond',
    name: 'Sảnh Diamond 💎',
    floorBase: '#e7dfd3',
    floorVein: 'rgba(150, 128, 104, 0.16)',
    floorGrout: 'rgba(160, 136, 100, 0.35)',
    wallColor: 0xe9dfd2,
    wainscotColor: 0xdccfbd,
    ceilingColor: 0xd9cfc2,
    drapeColor: 0xf0e7da,
    carpetColor: 0x6e2230, // đỏ rượu vang
    carpetBorderColor: 0xc4a467,
    ambientColor: 0xfff4e6,
    ambientIntensity: 0.25,
    primaryLightColor: 0xfff0dc,
    accentLightColor: 0xffe2b8,
    chairFrameColor: 0xc9a660,
    chairClothColor: 0xe9e0d2,
    chairBowColor: 0xb89a63,
    tableClothColor: 0xf3ece1,
    tableOverlayColor: 0xbf9f62,
    rugColor: '#cfc1ad',
    rugRing: '#a88a58',
    curtainColor: 0xf0e7da,
    flowerPalette: {
      primary: 0xf7f1e8, // hồng trắng
      secondary: 0xe9c7c3, // hồng phấn
      accent: 0xdcc38c,
      leaf: 0x6f8a5c,
    },
    screenBg: '#2a1d22',
    screenAccent: '#cfae6c',
    screenText: '#f3e7d6',
    chandelierStyle: 'crystal',
    description: 'Sang trọng cổ điển · Ngà, Champagne & Đỏ rượu vang',
    badge: '💎 Kim Cương',
  },
  sophia: {
    id: 'sophia',
    name: 'Sảnh Sophia 🌸',
    floorBase: '#eadcd2',
    floorVein: 'rgba(160, 112, 104, 0.14)',
    floorGrout: 'rgba(170, 128, 110, 0.32)',
    wallColor: 0xeedcd4,
    wainscotColor: 0xe0c8be,
    ceilingColor: 0xe0cfc7,
    drapeColor: 0xf3dfda,
    carpetColor: 0xa65d66, // hồng đất
    carpetBorderColor: 0xd2b07a,
    ambientColor: 0xfff0ea,
    ambientIntensity: 0.25,
    primaryLightColor: 0xffeee2,
    accentLightColor: 0xffd9c8,
    chairFrameColor: 0xcfae78,
    chairClothColor: 0xd9a9a8,
    chairBowColor: 0xf0d3cf,
    tableClothColor: 0xf6ece6,
    tableOverlayColor: 0xc58e8f,
    rugColor: '#dcbfb8',
    rugRing: '#b58a6a',
    curtainColor: 0xf3dfda,
    flowerPalette: {
      primary: 0xf0bcc2, // hồng phấn
      secondary: 0xfbeee6, // kem
      accent: 0xe8c48a,
      leaf: 0x7a9465,
    },
    screenBg: '#32202a',
    screenAccent: '#e3b7a8',
    screenText: '#f8eae4',
    chandelierStyle: 'fairy',
    description: 'Lãng mạn · Hồng phấn, Kem & Vàng champagne',
    badge: '🌸 Hoa Hồng',
  },
};
