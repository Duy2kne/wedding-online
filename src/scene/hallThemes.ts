export interface HallThemeConfig {
  id: 'diamond' | 'sophia';
  name: string;
  floorColor: number;
  floorRoughness: number;
  floorMetalness: number;
  wallColor: number;
  ceilingColor: number;
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
  curtainColor: number;
  flowerPalette: {
    primary: number;
    secondary: number;
    accent: number;
    leaf: number;
  };
  chandelierStyle: 'crystal' | 'fairy';
  description: string;
  badge: string;
}

export const HALL_THEMES: Record<'diamond' | 'sophia', HallThemeConfig> = {
  diamond: {
    id: 'diamond',
    name: 'Sảnh Diamond 💎',
    floorColor: 0xf5efe6, // Warm Crema Marfil polished marble
    floorRoughness: 0.12,
    floorMetalness: 0.05,
    wallColor: 0xf8fafc,
    ceilingColor: 0xffffff,
    carpetColor: 0x991b1b, // Royal Ruby Velvet carpet
    carpetBorderColor: 0xf59e0b, // Bright gold trim
    ambientColor: 0xfffbf5, // Warm bright ambient
    ambientIntensity: 2.2,
    primaryLightColor: 0xffffff,
    accentLightColor: 0x38bdf8, // Ice blue sparkling accent
    chairFrameColor: 0xd4af37, // Gilded Champagne Gold Tiffany frame
    chairClothColor: 0x1e3a8a, // Royal Sapphire Velvet cushion (bold contrast against floor)
    chairBowColor: 0x38bdf8, // Ice blue satin ribbon
    tableClothColor: 0xfffdf7, // Pearl Ivory Silk
    tableOverlayColor: 0xd4af37, // Gold runner
    curtainColor: 0xf8fafc,
    flowerPalette: {
      primary: 0xffffff, // White roses
      secondary: 0xbae6fd, // Phalaenopsis orchids
      accent: 0xfef08a, // Soft golden centers
      leaf: 0x22c55e,
    },
    chandelierStyle: 'crystal',
    description: 'Sang trọng hiện đại · Trắng, Bạc & Xanh băng pha lê',
    badge: '💎 Kim Cương',
  },
  sophia: {
    id: 'sophia',
    name: 'Sảnh Sophia 🌸',
    floorColor: 0xf7efe4, // Warm Tuscan Champagne Travertine
    floorRoughness: 0.14,
    floorMetalness: 0.05,
    wallColor: 0xffedd5,
    ceilingColor: 0xfffbf5,
    carpetColor: 0xbe123c, // Romantic deep rose velvet carpet
    carpetBorderColor: 0xf59e0b, // Warm champagne gold
    ambientColor: 0xfff7ed, // Warm candle ambient
    ambientIntensity: 2.4,
    primaryLightColor: 0xffedd5, // Warm ivory
    accentLightColor: 0xf43f5e, // Warm blush rose accent
    chairFrameColor: 0xd4af37, // Gilded Champagne Gold Tiffany frame
    chairClothColor: 0x881337, // Royal Deep Rose / Burgundy Velvet cushion (rich contrast)
    chairBowColor: 0xf472b6, // Blush pink satin bows
    tableClothColor: 0xfffaf0, // Ivory silk
    tableOverlayColor: 0xbe185d, // Rose gold runner
    curtainColor: 0xfce7f3, // Soft sheer pink voiles
    flowerPalette: {
      primary: 0xf472b6, // Blush roses
      secondary: 0xfbcfe8, // Peonies
      accent: 0xfde047, // Golden centers
      leaf: 0x16a34a,
    },
    chandelierStyle: 'fairy',
    description: 'Lãng mạn cổ điển · Hồng phấn, Kem & Vàng champagne',
    badge: '🌸 Hoa Hồng',
  },
};
