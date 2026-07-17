import type { BoardTile, PropertyGroup } from "./types.js";

export const STARTING_CASH = 1000;
export const START_BONUS = 250;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const PENALTY_BAIL = 100;
export const ROOM_CODE_LENGTH = 5;
export const MAX_BUILDINGS_PER_PROPERTY = 3;
export const BUILDING_PRICE_RATE = 0.42;
export const PROPERTY_SELL_RATE = 0.58;
export const BUILDING_SELL_RATE = 0.5;
// تسريع إيقاع اللعب (ديدوس): ~55% من قيم النسخة المستقلة —
// يجب أن تطابقها النسخ المكررة في server/bankel7az.js حتى يتزامن قفل الحركة مع وصول العربية
export const SYNC_PLAYBACK_DELAY_MS = 300;
export const CAR_MOVEMENT_OFFSET_MS = 140;
export const CAR_STEP_MS = 110;
export const DICE_THROW_MS = 560;
export const ACTION_UNLOCK_BUFFER_MS = 100;

export const GROUP_NAMES: Record<PropertyGroup, string> = {
  oldCairo: "القاهرة الكبرى",
  westCoast: "الساحل الغربي",
  centralDelta: "وسط الدلتا",
  eastDelta: "شرق الدلتا",
  canal: "مدن القناة",
  middleEgypt: "شمال الصعيد",
  upperEgypt: "وسط الصعيد",
  southValley: "جنوب الوادي",
  redSea: "سينا والبحر الأحمر",
  transport: "محافظات",
  utility: "محافظات"
};

export const BOARD_TILES: BoardTile[] = [
  special(0, "start", "البداية", "كل ما تعدي البداية خد ٢٥٠ جنيه."),

  property(1, "القاهرة", "oldCairo", "#9f342d", 90, 7),
  property(2, "الجيزة", "oldCairo", "#9f342d", 110, 9),
  property(3, "القليوبية", "oldCairo", "#9f342d", 130, 12),
  special(4, "fate", "كارت حظ", "اسحب كارت وشوف النصيب."),

  property(5, "الإسكندرية", "westCoast", "#2563c7", 140, 13, "إسكندرية"),
  property(6, "البحيرة", "westCoast", "#2563c7", 160, 16),
  property(7, "مطروح", "westCoast", "#2563c7", 180, 19),
  tax(8, "مخالفة", "مخالفة عشوائية حسب اللي هيطلعلك.", 100),

  property(9, "كفر الشيخ", "centralDelta", "#16834f", 190, 20),
  property(10, "الغربية", "centralDelta", "#16834f", 210, 23),
  property(11, "المنوفية", "centralDelta", "#16834f", 230, 27),
  special(12, "penalty", "القسم", "زيارة بس، إلا لو كارت دخلك هنا."),

  property(13, "الدقهلية", "eastDelta", "#b87900", 230, 26),
  property(14, "الشرقية", "eastDelta", "#b87900", 250, 30),
  property(15, "دمياط", "eastDelta", "#b87900", 270, 34),
  special(16, "fate", "كارت حظ", "اسحب كارت وشوف الحكاية."),

  property(17, "بورسعيد", "canal", "#c52b71", 280, 35),
  property(18, "الإسماعيلية", "canal", "#c52b71", 300, 40, "إسماعيلية"),
  property(19, "السويس", "canal", "#c52b71", 320, 46),
  special(20, "freeRest", "استراحة", "استراحة على القهوة. مفيش دفع."),

  property(21, "الفيوم", "middleEgypt", "#087f99", 320, 43),
  property(22, "بني سويف", "middleEgypt", "#087f99", 350, 50),
  property(23, "المنيا", "middleEgypt", "#087f99", 380, 58),
  tax(24, "رسوم", "رسوم عشوائية حسب الورقة اللي تطلع.", 150),

  property(25, "أسيوط", "upperEgypt", "#dd5519", 390, 60),
  property(26, "الوادي الجديد", "upperEgypt", "#dd5519", 420, 70),
  property(27, "سوهاج", "upperEgypt", "#dd5519", 450, 82),
  special(28, "fate", "كارت حظ", "اسحب كارت وشوف ربنا كاتب إيه."),

  property(29, "قنا", "southValley", "#7138b8", 460, 78),
  property(30, "الأقصر", "southValley", "#7138b8", 500, 92),
  property(31, "أسوان", "southValley", "#7138b8", 540, 108),
  special(32, "goToPenalty", "تفتيش", "روح على القسم فورًا."),

  property(33, "شمال سيناء", "redSea", "#087267", 560, 100, "شمال سينا"),
  property(34, "جنوب سيناء", "redSea", "#087267", 610, 120, "جنوب سينا"),
  property(35, "البحر الأحمر", "redSea", "#087267", 660, 145),
  special(36, "fate", "كارت حظ", "اسحب كارت وعيش اللحظة."),
  tax(37, "مصاريف", "مصاريف طارئة بتتحدد وقتها.", 120)
];

export const PENALTY_TILE_ID = 12;

function property(
  id: number,
  name: string,
  group: Exclude<PropertyGroup, "transport" | "utility">,
  color: string,
  price: number,
  rent: number,
  shortName = name
): BoardTile {
  return {
    id,
    kind: "property",
    name,
    shortName,
    description: `${name} من مجموعة ${GROUP_NAMES[group]}. امتلاك التلات محافظات بيفتح البناء ويقوي الإيجار.`,
    group,
    color,
    price,
    rent
  };
}

function special(
  id: number,
  kind: "start" | "fate" | "penalty" | "goToPenalty" | "freeRest",
  name: string,
  description: string
): BoardTile {
  return { id, kind, name, shortName: name === "كارت حظ" ? "حظ" : name, description } as BoardTile;
}

function tax(id: number, name: string, description: string, amount: number): BoardTile {
  return { id, kind: "tax", name, shortName: name, description, amount };
}
