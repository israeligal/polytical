import type { CurrentUser, Market, Politician } from "@/lib/types";

// NOTE: v1 design-build seed data. Facts are illustrative placeholders; production
// facts + resolutions come ONLY from official gov sources / newsletters (PRD §8).

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export const politicians: Politician[] = [
  {
    id: "bibi",
    name: "בנימין נתניהו",
    party: "הליכוד",
    role: "ראש הממשלה",
    cat: 1,
    tagline: "השחקן הוותיק של הזירה",
    facts: [
      { label: "גיל", value: "76" },
      { label: "בכנסת מאז", value: "1988" },
      { label: "תפקיד", value: "ראש הממשלה" },
      { label: "כהונות כרה״מ", value: "3" },
    ],
  },
  {
    id: "lapid",
    name: "יאיר לפיד",
    party: "יש עתיד",
    role: "יו״ר האופוזיציה",
    cat: 2,
    tagline: "איש התקשורת שהפך לפוליטיקאי",
    facts: [
      { label: "גיל", value: "62" },
      { label: "בכנסת מאז", value: "2013" },
      { label: "תפקיד", value: "יו״ר האופוזיציה" },
      { label: "מנדטים", value: "24" },
    ],
  },
  {
    id: "gantz",
    name: "בני גנץ",
    party: "המחנה הממלכתי",
    role: "חבר כנסת",
    cat: 3,
    tagline: "הרמטכ״ל שנכנס לזירה",
    facts: [
      { label: "גיל", value: "66" },
      { label: "בכנסת מאז", value: "2019" },
      { label: "רקע", value: "רמטכ״ל 20" },
      { label: "מנדטים", value: "12" },
    ],
  },
  {
    id: "smotrich",
    name: "בצלאל סמוטריץ׳",
    party: "הציונות הדתית",
    role: "שר האוצר",
    cat: 5,
    tagline: "האיש של הימין הדתי",
    facts: [
      { label: "גיל", value: "45" },
      { label: "בכנסת מאז", value: "2015" },
      { label: "תפקיד", value: "שר האוצר" },
      { label: "מנדטים", value: "7" },
    ],
  },
  {
    id: "bengvir",
    name: "איתמר בן גביר",
    party: "עוצמה יהודית",
    role: "השר לביטחון לאומי",
    cat: 6,
    tagline: "השר לביטחון לאומי",
    facts: [
      { label: "גיל", value: "49" },
      { label: "בכנסת מאז", value: "2021" },
      { label: "תפקיד", value: "ביטחון לאומי" },
      { label: "מנדטים", value: "6" },
    ],
  },
  {
    id: "liberman",
    name: "אביגדור ליברמן",
    party: "ישראל ביתנו",
    role: "יו״ר המפלגה",
    cat: 7,
    tagline: "שר הביטחון לשעבר",
    facts: [
      { label: "גיל", value: "67" },
      { label: "בכנסת מאז", value: "1999" },
      { label: "רקע", value: "שר ביטחון לשעבר" },
      { label: "מנדטים", value: "6" },
    ],
  },
];

export const markets: Market[] = [
  {
    id: "budget-2026",
    category: "coalition",
    type: "binary",
    hot: true,
    question: "האם תקציב 2026 יאושר עד המועד החוקי?",
    closeAt: inDays(3),
    politicianIds: ["smotrich", "bibi"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 7400 },
      { id: "no", label: "לא", predictors: 3100 },
    ],
  },
  {
    id: "early-elections",
    category: "elections",
    type: "binary",
    hot: true,
    question: "האם יוכרזו בחירות מוקדמות עד סוף 2026?",
    closeAt: inDays(21),
    politicianIds: ["bibi", "lapid"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 4200 },
      { id: "no", label: "לא", predictors: 9800 },
    ],
  },
  {
    id: "next-finance-minister",
    category: "personnel",
    type: "multi",
    question: "מי יכהן כשר האוצר בתום השנה?",
    closeAt: inDays(10),
    politicianIds: ["smotrich", "liberman"],
    outcomes: [
      { id: "smotrich", label: "סמוטריץ׳", predictors: 5400, color: 5 },
      { id: "barkat", label: "ניר ברקת", predictors: 2100, color: 1 },
      { id: "liberman", label: "ליברמן", predictors: 1200, color: 7 },
      { id: "other", label: "אחר", predictors: 1300, color: 4 },
    ],
  },
  {
    id: "bibi-pm-eoy",
    category: "coalition",
    type: "binary",
    question: "האם נתניהו יישאר ראש הממשלה עד סוף השנה?",
    closeAt: inDays(60),
    politicianIds: ["bibi"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 8900 },
      { id: "no", label: "לא", predictors: 2600 },
    ],
  },
  {
    id: "bengvir-resign",
    category: "coalition",
    type: "binary",
    question: "האם בן גביר יפרוש מהקואליציה ברבעון הבא?",
    closeAt: inDays(14),
    politicianIds: ["bengvir", "bibi"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 1900 },
      { id: "no", label: "לא", predictors: 6500 },
    ],
  },
  {
    id: "draft-law",
    category: "legislation",
    type: "binary",
    question: "האם חוק הגיוס יעבור בקריאה שנייה ושלישית עד פגרת הקיץ?",
    closeAt: inDays(25),
    politicianIds: ["smotrich", "liberman"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 3300 },
      { id: "no", label: "לא", predictors: 4700 },
    ],
  },
];

export const currentUser: CurrentUser = {
  handle: "gal",
  rank: 142,
  accuracy: 64,
  totalWins: 32,
  totalResolved: 50,
};

export const getPolitician = (id: string): Politician | undefined =>
  politicians.find((p) => p.id === id);

export const marketPoliticians = (m: Market): Politician[] =>
  m.politicianIds
    .map(getPolitician)
    .filter((p): p is Politician => Boolean(p));

export const marketsForPolitician = (id: string): Market[] =>
  markets.filter((m) => m.politicianIds.includes(id));
