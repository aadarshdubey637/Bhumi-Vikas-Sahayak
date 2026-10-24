// Product guide: answers "how do I use NirmaanSetu?" questions without calling the rules backend. Everything the guide says is about
// this application (what each page does, how to sign in, how voice works); it never states a building rule. Rule questions go to /ask.
export interface GuideAction {
  to: string;
  /** i18n key of the label */
  label: string;
}
export interface GuideTopic {
  id: string;
  /** English and Hindi / Hinglish patterns, matched against the lower-cased question */
  match: RegExp[];
  steps: number;
  actions: GuideAction[];
  /** example questions (i18n keys) offered as buttons under the answer */
  ask?: string[];
}

const EXAMPLES = ["as.q3", "as.qFar", "as.q4", "as.q1"];

/** Small talk is recognised only in short messages, so a real question that happens to start with "hello" still goes to the rules. */
const GREETING = /^(hi+|hii+|hy+|hey+|hello+|helo+|hallo|namaste|namaskar|good (morning|afternoon|evening|day)|how are you|kaise ho|kya haal|नमस्ते|नमस्कार|हेलो|हैलो|हाय|सुप्रभात|आप कैसे हैं|कैसे हो)(?=$|[ \s!.?,।])/i;
const THANKS = /^(thanks?|thank you|thx|ty|shukriya|dhanyavad|धन्यवाद|शुक्रिया|bye|goodbye|see you|alvida|अलविदा)(?=$|[ \s!.?,।])/i;

export const GUIDE: GuideTopic[] = [
  { id: "greeting", match: [], steps: 0, actions: [], ask: EXAMPLES },
  { id: "thanks", match: [], steps: 0, actions: [] },
  {
    id: "capabilities",
    match: [/what can (you|this)|what do you do|how can you help|\bhelp\b|capabilit|features?\b|who are you|about (you|nirmaan|this app)|आप क्या|क्या कर सकते|मदद|सहायता|आप कौन|निर्माणसेतु क्या/],
    steps: 4,
    actions: [{ to: "/workbench", label: "nav.workbench" }, { to: "/calculator", label: "nav.calculator" }],
  },
  {
    id: "journey",
    // "I want to build a home from scratch, what do I do?": the whole path, not one rule. (Questions like "Can I build a three-storey house on my plot?" are rule questions and go to the rulebook.)
    match: [/from scratch|start(ing)? (to )?(build|construct)|begin(ning)? (to )?(build|construct)|how (do|to|can) i (build|construct)|what (should |do )?i do|build(ing)? (a |my |an )?(new )?(home|house)\b|new (home|house)|नया घर|घर (बनाना|बनाने|बनवाना|बनवाने)|मकान (बनाना|बनाने|बनवाना|बनवाने)|कहाँ से शुरू|क्या करूँ|क्या करना/],
    steps: 5,
    actions: [{ to: "/workbench", label: "nav.workbench" }],
    ask: EXAMPLES,
  },
  {
    id: "start",
    match: [/how (do|to|can) i (start|begin)|get(ting)? started|where (do|to) (i )?start|first step|(use|using) (the )?(app|this|nirmaan|website|site)\b|kaise (shuru|start)|शुरू|(ऐप|एप|वेबसाइट).*(कैसे|इस्तेमाल|उपयोग)|कहाँ से/],
    steps: 4,
    actions: [{ to: "/workbench", label: "nav.workbench" }],
  },
  {
    id: "workbench",
    match: [/work\s?bench|3\s?d|three.?d|visuali[sz]|house (model|view)|animation|construction (animation|view)|floor plan|वर्कबेंच|कार्यक्षेत्र|थ्री डी|३डी|नक्शा|मकान का मॉडल|निर्माण एनिमेशन/],
    steps: 4,
    actions: [{ to: "/workbench", label: "nav.workbench" }],
  },
  {
    id: "assessment",
    match: [/assess|compliance|violation|check my (plot|project|house)|evaluate|जाँच|अनुपालन|उल्लंघन|आकलन/],
    steps: 3,
    actions: [{ to: "/workbench", label: "nav.workbench" }, { to: "/plot-check", label: "nav.plotCheck" }],
  },
  {
    id: "calculator",
    match: [/calculator|calculate (area|my plot)|area calc|permissible construction|कैलकुलेटर|क्षेत्रफल निकाल|गणना/],
    steps: 3,
    actions: [{ to: "/calculator", label: "nav.calculator" }],
  },
  {
    id: "account",
    match: [/sign ?(in|up)|log ?(in|out)|register|account|password|save (a |my |the |an )?(project|work|assessment)|projects?\b.*save|लॉग ?इन|साइन|खाता|पासवर्ड|सहेज|रजिस्टर/],
    steps: 3,
    actions: [{ to: "/signup", label: "land.cta.signup" }, { to: "/projects", label: "nav.projects" }],
  },
  {
    id: "voice",
    match: [/voice|speak|listen|microphone|\bmic\b|read (it )?aloud|text.?to.?speech|आवाज़|आवाज|बोल|सुन|माइक/],
    steps: 3,
    actions: [{ to: "/workbench", label: "nav.workbench" }],
  },
  {
    id: "language",
    match: [/hindi|language|हिंदी|हिन्दी|भाषा|translate|अनुवाद/],
    steps: 3,
    actions: [],
  },
  {
    id: "rulebook",
    match: [/rule ?book|source|pdf|which rules|where (do|did) (you|the) (get|rules)|amendment|नियमावली|स्रोत|संशोधन|कौन से नियम/],
    steps: 3,
    actions: [{ to: "/rules", label: "nav.rules" }, { to: "/amendments", label: "nav.amendments" }],
  },
  {
    id: "limits",
    match: [/approv|legal(ly)?|official|verified|accurate|trust|reliable|sure|guarantee|अनुमोदन|आधिकारिक|सत्यापित|भरोसा|कानूनी|सही है/],
    steps: 3,
    actions: [{ to: "/about", label: "nav.about" }],
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The best product-guide topic for a question, or null (then it is a rules question). Rule-like questions are never taken by the guide. */
export function matchGuide(question: string): GuideTopic | null {
  const q = norm(question);
  if (!q) return null;
  // a question that is clearly about a regulation value is a rules question, even when it also contains a guide word
  if (/setback|open space|far\b|fsi|floor area|height limit|parking|permission fee|ground coverage|plot (area|size)|road width|सेटबैक|खुली जगह|फ़्लोर एरिया|फ्लोर एरिया|ऊँचाई|पार्किंग|फीस|शुल्क/.test(q) && !/how (do|to|can) i|कैसे/.test(q)) return null;
  if (q.split(" ").length <= 4) {
    if (GREETING.test(q)) return guideById("greeting") ?? null;
    if (THANKS.test(q)) return guideById("thanks") ?? null;
  }
  let best: { t: GuideTopic; score: number } | null = null;
  for (const t of GUIDE) {
    const score = t.match.reduce((n, re) => n + (re.test(q) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}

export const guideById = (id: string): GuideTopic | undefined => GUIDE.find((g) => g.id === id);
