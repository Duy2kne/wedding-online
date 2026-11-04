// Bộ lọc từ tục (chat, lời chúc, tên khách...).
// - Khớp nguyên từ theo Unicode (chữ có dấu tiếng Việt), không bắt nhầm chữ nằm trong từ khác.
// - Không phân biệt hoa thường, bắt cả kiểu kéo dài chữ (đmmmm, cccc) và chèn dấu chấm/gạch (đ.m, c-c, c*c).
// - Không thêm bản không dấu của những từ dễ trùng từ thường (vd: "buoi" = buổi, "deo" = đeo).
// Muốn chặn thêm từ nào, chỉ cần thêm vào danh sách dưới đây (viết thường).
export const BAD_WORDS: string[] = [
  // chửi thề, viết tắt
  'đm', 'đmm', 'dm', 'dmm', 'đcm', 'dcm', 'đkm', 'dkm', 'đcmm', 'dcmm', 'đmcs', 'dmcs',
  'đcđ', 'dcd', 'đờ mờ', 'đậu má', 'đù má', 'đụ má', 'đụ mẹ', 'du ma', 'dume', 'đụ', 'địt', 'dit', 'ditme', 'dit me',
  'đéo', 'đếch', 'mẹ kiếp', 'mẹ mày', 'má mày', 'mả mẹ', 'cmm', 'cmn', 'cmnr', 'con mẹ mày',
  'vcl', 'vkl', 'vl', 'vcc', 'vler', 'vlz', 'vãi lồn', 'vãi l', 'vãi cả lồn', 'vãi cứt', 'vãi đái',
  'cl', 'clm', 'clmm', 'clgt', 'cmm', 'cc', 'cặc', 'kặc', 'cak', 'lồn', 'loz', 'lz', 'lìn', 'buồi', 'cứt',
  'óc chó', 'oc cho', 'chó đẻ', 'đồ chó', 'thằng chó', 'súc vật', 'khốn nạn', 'mất dạy', 'đĩ', 'con đĩ', 'cave',
  'ngu như chó', 'ngu như bò', 'thằng ngu', 'con ngu', 'đồ ngu', 'óc lợn', 'óc trâu', 'rảnh háng', 'bố láo', 'láo toét',
  // tiếng Anh
  'fuck', 'fck', 'fuk', 'fucking', 'wtf', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'motherfucker', 'stfu',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEP = '[._*\\-]*'; // ký tự chèn giữa các chữ để lách: đ.m, c-c, c*c

function toPattern(word: string): string {
  return [...word.normalize('NFC')]
    .map((ch) => (ch === ' ' ? '\\s+' : `${escapeRe(ch)}+`))
    .join(SEP);
}

const BAD_WORD_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...new Set(BAD_WORDS)]
    .sort((a, b) => b.length - a.length)
    .map(toPattern)
    .join('|')})(?![\\p{L}\\p{N}])`,
  'giu'
);

/** Thay từ tục bằng *** */
export function maskProfanity(text: string): string {
  return text.normalize('NFC').replace(BAD_WORD_RE, '***');
}
