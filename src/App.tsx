import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  Map as MapIcon,
  CheckCircle,
  Navigation,
  Menu,
  ArrowRight,
  BookOpen,
  Gamepad2,
  Home,
  Trophy,
  PieChart,
  Loader2,
} from 'lucide-react';
import L from 'leaflet';

// --- 1. 設定 Leaflet 圖示 (避免破圖) ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- 2. 初始化 AI ---
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

// --- 3. 圖片轉 Base64 函式 (已修正 Type 錯誤) ---
async function fileToGenerativePart(file: File) {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
}

// --- 4. 遊戲題庫 ---
const GAME_QUESTIONS = [
  {
    id: 1,
    question: '前面的建築物使用了「鏡面玻璃」，請問這對鳥類來說安全嗎？',
    options: [
      { text: '很安全，鳥會照鏡子', isCorrect: false },
      { text: '危險！鳥會以為那是風景', isCorrect: true },
    ],
    explanation: '鏡面玻璃會反射天空或樹木，鳥類無法分辨虛實，容易高速撞擊。',
  },
  {
    id: 2,
    question: '防撞貼紙的間隔距離應該是多少才有效？',
    options: [
      { text: '5 x 10 公分 (5x10規則)', isCorrect: true },
      { text: '隨便貼一張猛禽貼紙', isCorrect: false },
    ],
    explanation:
      '必須使用「5x10規則」，讓空隙小於鳥類身體，牠們才不會嘗試穿越。',
  },
];

// --- 5. 主程式 ---
function App() {
  const [view, setView] = useState<'home' | 'report' | 'map' | 'info' | 'game'>(
    'home'
  );
  const [reports, setReports] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const [formData, setFormData] = useState({
    reporter_name: '',
    bird_species: '',
    status: '死亡',
    window_type: '透明玻璃',
    photo_url: '',
    latitude: 0,
    longitude: 0,
    description: '',
  });

  // 遊戲狀態
  const [gameStep, setGameStep] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<{
    show: boolean;
    isCorrect: boolean;
    text: string;
  }>({ show: false, isCorrect: false, text: '' });

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setReports(data);
  };

  // 數據統計 (自動計算)
  const stats = useMemo(() => {
    const total = reports.length;
    if (total === 0) return null;
    const statusCounts: Record<string, number> = {};
    const speciesCounts: Record<string, number> = {};

    reports.forEach((r) => {
      const s = r.status || '未知';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      let sp = r.bird_species?.split('(')[0].trim() || '未知鳥種';
      speciesCounts[sp] = (speciesCounts[sp] || 0) + 1;
    });

    const sortedSpecies = Object.entries(speciesCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    return { total, statusCounts, sortedSpecies };
  }, [reports]);

  // 上傳 + AI 辨識
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);
    setAiAnalyzing(true);

    try {
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage
        .from('bird-photos')
        .upload(fileName, file);
      if (error) throw error;

      const { data } = supabase.storage
        .from('bird-photos')
        .getPublicUrl(fileName);
      setFormData((prev) => ({ ...prev, photo_url: data.publicUrl }));

      // 呼叫 Google Gemini
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = await fileToGenerativePart(file);
      const prompt =
        '這是一張鳥類的照片。請辨識這是什麼鳥？請只回傳「鳥的中文名稱」以及你對這個判斷的「信心度」。格式請用：鳥名 (信心度)。例如：五色鳥 (95%)。如果不是鳥，請回傳：無法辨識。';

      const result = await model.generateContent([prompt, imagePart]);
      const aiText = result.response.text();

      setFormData((prev) => ({ ...prev, bird_species: aiText.trim() }));
      setStep(2);
    } catch (error: any) {
      alert('上傳或辨識失敗，請檢查網路設定');
      console.error(error);
    } finally {
      setUploading(false);
      setAiAnalyzing(false);
    }
  };

  const handleGetLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
        setStep(3);
      },
      () => alert('無法取得 GPS')
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    const { error } = await supabase.from('reports').insert([formData]);
    if (!error) {
      setStep(4);
      fetchReports();
    } else {
      alert('送出失敗');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      reporter_name: '',
      bird_species: '',
      status: '死亡',
      window_type: '透明玻璃',
      photo_url: '',
      latitude: 0,
      longitude: 0,
      description: '',
    });
    setStep(1);
    setView('home');
  };

  // 遊戲邏輯
  const handleAnswer = (isCorrect: boolean, explanation: string) => {
    if (isCorrect) setScore((s) => s + 100);
    setFeedback({ show: true, isCorrect, text: explanation });
  };
  const nextQuestion = () => {
    setFeedback({ ...feedback, show: false });
    if (currentQ < GAME_QUESTIONS.length - 1) setCurrentQ((q) => q + 1);
    else setGameStep(2);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-emerald-700 text-white p-4 shadow-md sticky top-0 z-[1000] flex justify-between items-center">
        <div
          className="flex items-center gap-2"
          onClick={() => setView('home')}
        >
          <Menu size={20} />
          <h1 className="text-lg font-bold tracking-wide">城市飛羽守護站</h1>
        </div>
        {aiAnalyzing && (
          <div className="text-xs bg-emerald-800 px-3 py-1 rounded-full flex gap-1">
            <Loader2 className="animate-spin" size={12} /> AI 辨識中
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto relative p-4 pb-24">
        {/* === 1. 首頁 === */}
        {view === 'home' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 text-center text-white shadow-lg relative">
              <h2 className="text-xl font-bold mb-1 opacity-90">
                目前累積回報
              </h2>
              <div className="text-5xl font-black mb-2">{reports.length}</div>
              <p className="text-emerald-100 text-sm mb-6">筆窗殺紀錄</p>
              <button
                onClick={() => setView('report')}
                className="w-full bg-white text-emerald-700 py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"
              >
                <Camera size={20} /> 立即回報
              </button>
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-gray-700 pl-2 border-l-4 border-emerald-500">
                最新回報
              </h3>
              {reports.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  className="bg-white p-3 rounded-xl shadow-sm border flex gap-3 items-center"
                >
                  <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {r.photo_url ? (
                      <img
                        src={r.photo_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="m-auto mt-4 text-gray-300" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-gray-800">
                      {r.bird_species}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()} • {r.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === 2. 統計 === */}
        {view === 'info' && stats && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <PieChart className="text-emerald-600" /> 數據統計
            </h2>
            <div className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-bold text-gray-700">
                🐦 最常受害鳥種 (Top 5)
              </h3>
              {stats.sortedSpecies.map(([sp, c], i) => (
                <div
                  key={sp}
                  className="flex justify-between border-b py-2 text-sm last:border-0"
                >
                  <span>
                    {i + 1}. {sp}
                  </span>
                  <span className="font-bold text-emerald-600">{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === 3. 遊戲 === */}
        {view === 'game' && (
          <div className="h-full flex flex-col">
            {gameStep === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 bg-white p-6 rounded-3xl shadow-sm">
                <Gamepad2 size={48} className="text-orange-500" />
                <h2 className="text-2xl font-bold">鳥類守護者挑戰</h2>
                <button
                  onClick={() => setGameStep(1)}
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg"
                >
                  開始挑戰
                </button>
              </div>
            ) : gameStep === 1 ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm flex-1">
                <div className="flex justify-between mb-4 text-xs font-bold text-gray-400">
                  <span>Q{currentQ + 1}</span>
                  <span>Score: {score}</span>
                </div>
                <h3 className="text-lg font-bold mb-6">
                  {GAME_QUESTIONS[currentQ].question}
                </h3>
                {!feedback.show ? (
                  <div className="space-y-3">
                    {GAME_QUESTIONS[currentQ].options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() =>
                          handleAnswer(
                            opt.isCorrect,
                            GAME_QUESTIONS[currentQ].explanation
                          )
                        }
                        className="w-full text-left p-4 rounded-xl border hover:bg-emerald-50 font-medium"
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`p-5 rounded-xl border-2 ${
                      feedback.isCorrect
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="font-bold mb-2">
                      {feedback.isCorrect ? '答對了！' : '答錯了...'}
                    </div>
                    <p className="text-sm mb-4">{feedback.text}</p>
                    <button
                      onClick={nextQuestion}
                      className="w-full bg-gray-800 text-white py-3 rounded-lg font-bold"
                    >
                      下一題
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-8 bg-white rounded-3xl shadow-sm mt-10">
                <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
                <h2 className="text-2xl font-bold">挑戰完成！</h2>
                <p className="text-4xl font-black text-emerald-600 mt-2">
                  {score} 分
                </p>
                <button
                  onClick={() => {
                    setGameStep(0);
                    setScore(0);
                    setCurrentQ(0);
                  }}
                  className="bg-gray-100 text-gray-600 px-8 py-3 rounded-full font-bold mt-6"
                >
                  再玩一次
                </button>
              </div>
            )}
          </div>
        )}

        {/* === 4. 回報表單 === */}
        {view === 'report' && (
          <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm">
            {step === 1 && (
              <div className="text-center space-y-4">
                <h3 className="font-bold text-xl">步驟 1：拍攝/上傳</h3>
                <label className="block border-2 border-dashed border-emerald-200 bg-emerald-50 rounded-xl p-10 cursor-pointer">
                  {uploading ? (
                    <div className="text-emerald-600 font-bold">
                      {aiAnalyzing ? 'Gemini 辨識中...' : '上傳中...'}
                    </div>
                  ) : (
                    <>
                      <Camera
                        className="mx-auto mb-2 text-emerald-500"
                        size={32}
                      />{' '}
                      點擊拍攝
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-bold text-xl">步驟 2：確認與定位</h3>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  <label className="text-xs font-bold text-emerald-600">
                    AI 辨識結果
                  </label>
                  <input
                    value={formData.bird_species}
                    onChange={(e) =>
                      setFormData({ ...formData, bird_species: e.target.value })
                    }
                    className="w-full bg-transparent font-bold text-lg outline-none text-emerald-900"
                  />
                </div>
                {formData.photo_url && (
                  <img
                    src={formData.photo_url}
                    className="w-full h-48 object-cover rounded-xl"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleGetLocation}
                    className="flex-1 bg-blue-500 text-white p-3 rounded-xl font-bold flex justify-center gap-2"
                  >
                    <Navigation size={20} /> 獲取 GPS
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 bg-gray-100 text-gray-500 p-3 rounded-xl font-bold flex justify-center gap-2"
                  >
                    <ArrowRight size={20} /> 略過
                  </button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-bold text-xl">步驟 3：詳細資料</h3>
                {formData.latitude !== 0 ? (
                  <div className="h-32 rounded-xl overflow-hidden border">
                    <MapContainer
                      center={[formData.latitude, formData.longitude]}
                      zoom={15}
                      style={{ height: '100%', width: '100%' }}
                      dragging={false}
                      zoomControl={false}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker
                        position={[formData.latitude, formData.longitude]}
                      />
                    </MapContainer>
                  </div>
                ) : (
                  <div className="bg-gray-100 text-center p-4 rounded-xl text-gray-500 text-sm">
                    無 GPS 資料
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="border p-2 rounded-xl"
                  >
                    <option>死亡</option>
                    <option>暈眩</option>
                    <option>受傷</option>
                  </select>
                  <select
                    value={formData.window_type}
                    onChange={(e) =>
                      setFormData({ ...formData, window_type: e.target.value })
                    }
                    className="border p-2 rounded-xl"
                  >
                    <option>透明玻璃</option>
                    <option>反光玻璃</option>
                    <option>鏡面</option>
                  </select>
                </div>
                <input
                  placeholder="您的暱稱"
                  value={formData.reporter_name}
                  onChange={(e) =>
                    setFormData({ ...formData, reporter_name: e.target.value })
                  }
                  className="w-full border p-3 rounded-xl"
                />
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold shadow-lg mt-2"
                >
                  {loading ? '資料傳送中...' : '確認送出'}
                </button>
              </div>
            )}
            {step === 4 && (
              <div className="text-center py-10 space-y-4">
                <CheckCircle className="mx-auto text-emerald-500" size={64} />
                <h3 className="text-2xl font-bold">回報成功！</h3>
                <button
                  onClick={resetForm}
                  className="bg-gray-100 px-8 py-3 rounded-full font-bold"
                >
                  回首頁
                </button>
              </div>
            )}
          </div>
        )}

        {/* === 5. 地圖 === */}
        {view === 'map' && (
          <div className="h-[80vh] w-full rounded-xl overflow-hidden shadow-sm border relative z-0">
            <MapContainer
              center={[23.5, 121]}
              zoom={7}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {reports.map(
                (r) =>
                  r.latitude &&
                  r.latitude !== 0 && (
                    <Marker key={r.id} position={[r.latitude, r.longitude]}>
                      <Popup>
                        <strong className="text-emerald-700">
                          {r.bird_species}
                        </strong>
                        <br />
                        {r.status}
                      </Popup>
                    </Marker>
                  )
              )}
            </MapContainer>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2 pb-4 shadow-lg z-[1000]">
        <button
          onClick={() => setView('home')}
          className={`p-2 flex flex-col items-center gap-1 ${
            view === 'home' ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold">首頁</span>
        </button>
        <button
          onClick={() => setView('map')}
          className={`p-2 flex flex-col items-center gap-1 ${
            view === 'map' ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          <MapIcon size={24} />
          <span className="text-[10px] font-bold">地圖</span>
        </button>
        <button
          onClick={() => setView('report')}
          className="p-3 bg-emerald-600 text-white rounded-full -mt-8 shadow-lg border-4 border-white"
        >
          <Camera size={28} />
        </button>
        <button
          onClick={() => setView('info')}
          className={`p-2 flex flex-col items-center gap-1 ${
            view === 'info' ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          <PieChart size={24} />
          <span className="text-[10px] font-bold">統計</span>
        </button>
        <button
          onClick={() => setView('game')}
          className={`p-2 flex flex-col items-center gap-1 ${
            view === 'game' ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          <Gamepad2 size={24} />
          <span className="text-[10px] font-bold">遊戲</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
