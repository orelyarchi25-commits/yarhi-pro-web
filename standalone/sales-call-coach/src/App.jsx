import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, MessageSquare, ClipboardList, Hammer, Lock, AlertCircle } from 'lucide-react';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const loginPassword = import.meta.env.VITE_APP_PASSWORD || '1234';

const FAST_TRIGGERS = [
  { keyword: 'יקר', intent: 'price_objection', label: 'התנגדות מחיר', responses: ['המחיר משקף עובי אלומיניום עבה ואחריות מלאה על ההתקנה', 'זול בפרגולות אומר תחזוקה יקרה בעתיד. אצלי זה פעם אחת וזהו'] },
  { keyword: 'אחשוב', intent: 'hesitation', label: 'הלקוח מהסס', responses: ['בוא נסגור עכשיו כדי שאשריין לך מועד התקנה בלו"ז הקרוב', 'מה הנקודה הטכנית שעדיין לא ברורה לך? בוא נפתור אותה'] },
  { keyword: 'זול', intent: 'competitor_comparison', label: 'השוואה למתחרה', responses: ['תבדוק אם הוא נותן צביעה בתנור נגד חלודה כמו שאני נותן', 'ההבדל הוא בגימור ובדיוק של החיבורים. בוא תראה עבודות שלי'] },
  { keyword: 'אישה', intent: 'spouse_decision', label: 'החלטה משותפת', responses: ['מעולה, רוצה שאשלח לך הדמיה של העבודה שתראה לה?', 'אני יכול להסביר לשניכם בשיחה קצרה איך זה הולך להיראות'] },
  { keyword: 'בעלי', intent: 'spouse_decision', label: 'החלטה משותפת', responses: ['מעולה, רוצה שאשלח לך הדמיה של העבודה שתראי לו?', 'אני יכול להסביר לשניכם בשיחה קצרה איך זה הולך להיראות'] }
];

const INTENT_LABELS = {
  price_objection: 'התנגדות מחיר',
  hesitation: 'התלבטות / חוסר ביטחון',
  competitor_comparison: 'השוואה למתחרה',
  spouse_decision: 'התייעצות עם בן/בת זוג',
  general_doubt: 'בירור כללי',
  hot_lead: 'ליד חם - לסגור עכשיו!'
};

async function fetchGemini(payload) {
  if (!apiKey) throw new Error('Missing API key');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini returned empty payload');
  return JSON.parse(rawText);
}

function LoginGate({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = (event) => {
    event.preventDefault();
    if (password === loginPassword) {
      setError('');
      localStorage.setItem('sales_coach_auth', '1');
      onSuccess(true);
      return;
    }
    setError('סיסמה שגויה, נסה שוב');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl p-6 space-y-5 shadow-2xl">
        <div className="text-center">
          <div className="inline-flex bg-blue-600 p-3 rounded-2xl mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black">כניסה לעוזר מכירות</h1>
          <p className="text-sm text-slate-400 mt-2">הזן סיסמה כדי לגשת לאפליקציה מהטלפון</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 outline-none focus:border-blue-500"
          placeholder="סיסמה"
          required
        />
        {error ? <p className="text-red-400 text-sm font-bold">{error}</p> : null}
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 rounded-xl py-3 font-black transition">
          כניסה
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('sales_coach_auth') === '1');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [currentInterim, setCurrentInterim] = useState('');
  const [activeGuidance, setActiveGuidance] = useState(null);
  const [postCallReport, setPostCallReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const recognitionRef = useRef(null);
  const scrollRef = useRef(null);
  const fullTranscript = useRef([]);

  const hasSpeechSupport = useMemo(
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, currentInterim]);

  const callAIIntent = useCallback(async (text) => {
    try {
      const result = await fetchGemini({
        contents: [{ parts: [{ text: `הלקוח אמר: "${text}"` }] }],
        systemInstruction: {
          parts: [{ text: 'אתה עוזר מכירות אלומיניום. זהה כוונה והחזר JSON עם intent ו-2 תגובות קצרות ובולטות בעברית.' }]
        },
        generationConfig: { responseMimeType: 'application/json' }
      });

      setActiveGuidance({
        intent: result.intent,
        label: INTENT_LABELS[result.intent] || 'זיהוי כוונה',
        responses: Array.isArray(result.responses) ? result.responses.slice(0, 2) : [],
        source: 'חכם'
      });
    } catch {
      setErrorMsg('לא הצלחתי לקבל ניתוח AI כרגע. אפשר להמשיך לדבר והמערכת המיידית עדיין עובדת.');
    }
  }, []);

  useEffect(() => {
    if (!hasSpeechSupport) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      if (interim) {
        setCurrentInterim(interim);
        const match = FAST_TRIGGERS.find((t) => interim.toLowerCase().includes(t.keyword));
        if (match) {
          setActiveGuidance({ intent: match.intent, label: match.label, responses: match.responses, source: 'מיידי' });
        }
      }

      if (final) {
        const text = final.trim();
        setTranscript((prev) => [...prev, { text, id: Date.now() + Math.random() }]);
        fullTranscript.current.push(text);
        setCurrentInterim('');
        callAIIntent(text);
      }
    };

    recognition.onerror = () => {
      setErrorMsg('התרחשה שגיאה בזיהוי הקול. בדוק הרשאת מיקרופון.');
    };

    recognition.onend = () => {
      if (isListening) recognition.start();
    };

    recognitionRef.current = recognition;
  }, [callAIIntent, hasSpeechSupport, isListening]);

  const finalizeCall = async () => {
    if (fullTranscript.current.length === 0) return;
    setIsAnalyzing(true);
    try {
      const report = await fetchGemini({
        contents: [{ parts: [{ text: `נתח שיחה: ${fullTranscript.current.join(' | ')}` }] }],
        systemInstruction: {
          parts: [{ text: 'ניתוח שיחת מכירה בעברית. החזר JSON עם: lead_score (1-10), status (closed/follow_up/lost), main_objections (מערך מחרוזות בעברית), reason_not_closed (מחרוזת בעברית), missed_opportunities (מערך מחרוזות בעברית), next_action (מחרוזת בעברית).' }]
        },
        generationConfig: { responseMimeType: 'application/json' }
      });
      setPostCallReport(report);
    } catch {
      setErrorMsg('סיכום השיחה לא נוצר כרגע. נסה שוב לאחר שיחה נוספת.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggle = () => {
    if (!hasSpeechSupport) {
      setErrorMsg('הדפדפן הזה לא תומך בהאזנה רציפה. מומלץ Chrome בנייד/מחשב.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      finalizeCall();
    } else {
      setErrorMsg('');
      setTranscript([]);
      fullTranscript.current = [];
      setActiveGuidance(null);
      setPostCallReport(null);
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  if (!isAuthenticated) {
    return <LoginGate onSuccess={setIsAuthenticated} />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white font-sans overflow-hidden" dir="rtl">
      <header className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-inner">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">עוזר מכירות אלומיניום</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ניתוח שיחה ודוחות בזמן אמת</p>
          </div>
        </div>
        <button
          onClick={toggle}
          className={`p-5 rounded-full shadow-2xl transition-all active:scale-90 ${isListening ? 'bg-red-500 ring-4 ring-red-500/20' : 'bg-blue-600 shadow-blue-600/40'}`}
        >
          {isListening ? <Square className="fill-white w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      </header>

      {errorMsg ? (
        <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMsg}
        </div>
      ) : null}

      <main className="flex-grow overflow-y-auto p-4 space-y-3 pb-64 bg-slate-900/50">
        {transcript.map((t) => (
          <div key={t.id} className="bg-slate-800/80 p-4 rounded-2xl rounded-tr-none border border-slate-700 max-w-[85%] shadow-sm">
            <p className="text-sm font-medium leading-relaxed">{t.text}</p>
          </div>
        ))}
        {currentInterim ? <div className="text-blue-400/50 italic p-2 text-sm font-bold animate-pulse">{currentInterim}...</div> : null}
        <div ref={scrollRef} />
      </main>

      {activeGuidance ? (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent z-30">
          <div className="max-w-md mx-auto bg-slate-800 border-t-4 border-blue-500 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="bg-blue-600/20 px-4 py-2 flex justify-between items-center border-b border-slate-700">
              <span className="text-sm font-black text-blue-400 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> {activeGuidance.label}
              </span>
              <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase italic">
                זיהוי {activeGuidance.source}
              </span>
            </div>
            <div className="p-4 space-y-3">
              {activeGuidance.responses.map((r, i) => (
                <div key={i} className="bg-slate-700 p-4 rounded-2xl border border-slate-600 text-xl font-black text-white leading-tight shadow-inner flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm flex-shrink-0 shadow-lg">{i + 1}</div>
                  {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {postCallReport ? (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-[2.5rem] border border-slate-700 shadow-2xl p-8 space-y-6 overflow-y-auto max-h-[90vh]">
            <div className="text-center">
              <div className="flex justify-center mb-2 text-blue-500"><ClipboardList className="w-10 h-10" /></div>
              <h2 className="text-2xl font-black mb-1">סיכום שיחה מפורט</h2>
              <div className="text-6xl font-black text-blue-400 mt-2">
                {postCallReport.lead_score}
                <span className="text-sm text-slate-500 font-normal">/10</span>
              </div>
              <p className="text-xs text-slate-500 font-bold mt-1">ציון איכות הליד</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 text-center">
                <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">סטטוס מומלץ</div>
                <div className="text-sm font-black">
                  {postCallReport.status === 'closed' ? 'סגירה ✅' : postCallReport.status === 'follow_up' ? 'פולו-אפ 📞' : 'ליד אבוד ❌'}
                </div>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 text-center">
                <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">פעולה הבאה</div>
                <div className="text-sm font-black text-blue-400 leading-tight">{postCallReport.next_action}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-500 mb-2 mr-2">התנגדויות מרכזיות שזיהיתי:</h3>
                <div className="flex flex-wrap gap-2">
                  {(postCallReport.main_objections || []).map((o, i) => (
                    <span key={i} className="bg-red-500/10 text-red-400 text-[11px] font-bold px-3 py-1.5 rounded-full border border-red-500/20">
                      {o}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-500 mb-2 mr-2">הזדמנויות שאולי פספסת:</h3>
                <ul className="text-sm text-slate-300 space-y-2">
                  {(postCallReport.missed_opportunities || []).map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <div className="text-blue-500 font-bold italic">-</div>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button onClick={() => setPostCallReport(null)} className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-3xl font-black text-xl transition-all shadow-xl shadow-blue-600/20">
              הבנתי, לעסקה הבאה
            </button>
          </div>
        </div>
      ) : null}

      {isAnalyzing ? (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-blue-500/20" />
          <p className="font-black text-xl tracking-tighter animate-pulse">מנתח את השיחה ובונה דוח סיכום...</p>
        </div>
      ) : null}
    </div>
  );
}
