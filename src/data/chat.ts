import type { ChatThread } from '@/types'

const now = Date.now()
const min = 60_000

export const CHAT_SEED: ChatThread[] = [
  {
    id: 't1',
    name: 'الغرفة العامة',
    avatar: '🌍',
    members: 248,
    unread: 3,
    messages: [
      { id: 'm1', senderId: 'f4', senderName: 'خالد', senderAvatar: '🦅', text: 'مساء الخير جميعًا! مين جاهز لتحدي جديد؟ 🔥', time: now - 42 * min },
      { id: 'm2', senderId: 'f1', senderName: 'سارة', senderAvatar: '🦋', text: 'أنا جاهزة! بس هالمرة ما رح أرحمكم بإكس أو 😄', time: now - 38 * min },
      { id: 'm3', senderId: 'bot', senderName: 'روبوت قييمد', senderAvatar: '🤖', text: 'تذكير: مكافأتك اليومية بانتظارك في الصفحة الرئيسية 🎁', time: now - 30 * min },
      { id: 'm4', senderId: 'f9', senderName: 'ريم', senderAvatar: '🌺', text: 'جربت لعبة سرعة البرق؟ مستحيل أحد يجيب أقل من ٢٠٠ مللي ثانية!', time: now - 12 * min },
      { id: 'm5', senderId: 'f10', senderName: 'أحمد', senderAvatar: '🐯', text: 'تحدي مقبول ⚡ أرقامي القياسية تتكلم عني', time: now - 8 * min },
    ],
  },
  {
    id: 't2',
    name: 'أصدقاء قييمد',
    avatar: '💚',
    members: 11,
    unread: 1,
    messages: [
      { id: 'm6', senderId: 'f7', senderName: 'ليلى', senderAvatar: '🦚', text: 'يا جماعة لعبة الذاكرة إدمان! وصلت ١٤ حركة بس 🐪', time: now - 95 * min },
      { id: 'm7', senderId: 'f2', senderName: 'محمد', senderAvatar: '🦁', text: 'أنا وصلت ١٢ حركة، تعالوا نافسوني 😎', time: now - 80 * min },
      { id: 'm8', senderId: 'f5', senderName: 'نورة', senderAvatar: '🌙', text: 'مين يلعب معي حجر ورقة مقص؟', time: now - 25 * min },
    ],
  },
  {
    id: 't3',
    name: 'غرفة إكس أو',
    avatar: '⭕',
    members: 56,
    unread: 0,
    messages: [
      { id: 'm9', senderId: 'f2', senderName: 'محمد', senderAvatar: '🦁', text: 'الصعوبة الصعبة مستحيلة! الكمبيوتر ما يخسر أبدًا 🤯', time: now - 200 * min },
      { id: 'm10', senderId: 'f8', senderName: 'يوسف', senderAvatar: '🐬', text: 'هذا لأنه يستخدم خوارزمية مينيماكس، أفضل نتيجة تقدر توصلها هي التعادل', time: now - 180 * min },
      { id: 'm11', senderId: 'f4', senderName: 'خالد', senderAvatar: '🦅', text: 'نصيحة: ابدأ من الزاوية دايمًا 😉', time: now - 150 * min },
    ],
  },
  {
    id: 't4',
    name: 'غرفة الذاكرة',
    avatar: '🧠',
    members: 34,
    unread: 0,
    messages: [
      { id: 'm12', senderId: 'f5', senderName: 'نورة', senderAvatar: '🌙', text: 'الجمل والنخلة دايمًا يتلخبطون عندي 🐪🌴', time: now - 300 * min },
      { id: 'm13', senderId: 'f1', senderName: 'سارة', senderAvatar: '🦋', text: 'أنا أحفظ الأماكن بالأرقام، جربوا الطريقة!', time: now - 260 * min },
    ],
  },
  {
    id: 't5',
    name: 'غرفة المعلومات',
    avatar: '📚',
    members: 78,
    unread: 2,
    messages: [
      { id: 'm14', senderId: 'f10', senderName: 'أحمد', senderAvatar: '🐯', text: 'سؤال اليوم: ما هو أطول نهر في العالم؟ 🌊', time: now - 60 * min },
      { id: 'm15', senderId: 'f3', senderName: 'فاطمة', senderAvatar: '🌸', text: 'النيل طبعًا! هذي سهلة 😄', time: now - 55 * min },
      { id: 'm16', senderId: 'bot', senderName: 'روبوت قييمد', senderAvatar: '🤖', text: 'إجابة صحيحة يا فاطمة! جربوا لعبة أسئلة ثقافية لتحدي أصعب 🧠', time: now - 50 * min },
    ],
  },
]
