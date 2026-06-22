import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  List, 
  CheckCircle2, 
  Circle, 
  Wallet, 
  Users, 
  CalendarDays,
  Calculator,
  CreditCard,
  CloudLightning,
  Loader2,
  Trash2,
  Edit,
  WifiOff,
  Database,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

// --- Firebase 雲端資料庫模組 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// ============================================================================
// ✅ 您的專屬 Firebase 設定
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCgJX_mkfSsZiRsLJ7iNI_ECLIvw7mWH2Y",
  authDomain: "muzi-ledger.firebaseapp.com",
  projectId: "muzi-ledger",
  storageBucket: "muzi-ledger.firebasestorage.app",
  messagingSenderId: "1070962273635",
  appId: "1:1070962273635:web:de9c0a3222c352805f7756",
  measurementId: "G-53836X8G7K"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 預設的帳本資料 (用來確保資料庫有東西)
const pdfImportData = [
  { id: '1700000000001', name: '溫拿保險', totalAmount: 14966, periods: 12, startYear: 2025, startMonth: 12, paidPeriods: [0, 1, 2, 3, 4, 5] },
  { id: '1700000000002', name: '溫拿稅金', totalAmount: 7120, periods: 12, startYear: 2025, startMonth: 12, paidPeriods: [0, 1, 2, 3, 4, 5] },
  { id: '1700000000003', name: '烏冬保險', totalAmount: 6996, periods: 12, startYear: 2025, startMonth: 12, paidPeriods: [0, 1, 2, 3, 4, 5] },
  { id: '1700000000004', name: '溫拿保養', totalAmount: 9417, periods: 6, startYear: 2026, startMonth: 1, paidPeriods: [0] }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('list');
  const [debts, setDebts] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState(null); 
  const [syncStatus, setSyncStatus] = useState('connecting');
  
  // 美觀的浮動通知系統
  const [toast, setToast] = useState(null);

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPeriods, setFormPeriods] = useState(12);
  const [formStartDate, setFormStartDate] = useState('');
  const [editingId, setEditingId] = useState(null); 

  // 顯示通知的函數
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500); // 3.5秒後自動消失
  };

  // 自動匿名登入
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        setDbError("無法驗證身分！請確認已在 Firebase 啟用「匿名登入」。");
        setSyncStatus('error');
        setIsLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 即時監聽資料庫 (這裡會自動同步所有人的變更)
  useEffect(() => {
    if (!user) return;
    setSyncStatus('connecting');
    // ⚠️ 關鍵更新：換一個全新的資料庫頻道，避免與舊資料卡住衝突
    const debtsRef = collection(db, 'muzi_debts_v4');
    
    const unsubscribe = onSnapshot(debtsRef, async (snapshot) => {
      setSyncStatus('synced');
      setDbError(null);
      
      // 如果發現新頻道是空的，自動幫您塞入基礎資料，確認連線暢通！
      if (snapshot.empty) {
        setIsLoading(true);
        for (const debt of pdfImportData) {
          const debtDoc = doc(db, 'muzi_debts_v4', debt.id);
          await setDoc(debtDoc, debt);
        }
      } else {
        const loadedDebts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedDebts.sort((a, b) => Number(a.id) - Number(b.id)); // 依建立時間排序
        setDebts(loadedDebts); 
        setIsLoading(false);
      }
    }, (error) => {
      console.error("Firebase 連線錯誤:", error);
      setSyncStatus('error');
      setIsLoading(false);
      if (error.code === 'permission-denied') {
        setDbError("無法連線雲端資料庫！請去 Firebase 建立 Firestore 資料庫，並將規則設定為「測試模式」(Test mode)。");
      } else {
        setDbError(`雲端連線失敗: ${error.message}`);
      }
    });
    
    return () => unsubscribe();
  }, [user]);

  const getMonthString = (startYear, startMonth, offset) => {
    const date = new Date(startYear, startMonth - 1 + offset, 1);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const calculateDebtStats = () => {
    let totalDebt = 0;
    let totalPaid = 0;
    debts.forEach(debt => {
      totalDebt += debt.totalAmount;
      const monthlyTotal = Math.round(debt.totalAmount / debt.periods);
      totalPaid += debt.paidPeriods.length * monthlyTotal;
    });
    return { totalDebt, totalPaid, outstandingBalance: Math.max(0, totalDebt - totalPaid) };
  };

  const { totalDebt, totalPaid, outstandingBalance } = calculateDebtStats();

  // 🟢 極速版：打勾繳款 (瞬間背景執行)
  const togglePaidStatus = (debtId, periodIndex) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;
    
    const isPaid = debt.paidPeriods.includes(periodIndex);
    const newPaidPeriods = isPaid 
      ? debt.paidPeriods.filter(i => i !== periodIndex) 
      : [...debt.paidPeriods, periodIndex];
    
    const syncUpdate = async () => {
      try {
        const savePromise = setDoc(doc(db, 'muzi_debts_v4', debtId), { ...debt, paidPeriods: newPaidPeriods }, { merge: true });
        const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000));
        await Promise.race([savePromise, timeout]);
        if (!isPaid) showToast('✅ 繳款紀錄已同步！對方已可看見', 'success');
      } catch (err) {
        showToast("⚠️ 網路不穩，打勾狀態將在背景重試", 'error');
      }
    };
    
    syncUpdate(); // 直接丟去背景跑，畫面瞬間打勾
  };

  // 🟢 極速版：刪除項目 (瞬間背景執行)
  const handleDeleteDebt = (debtId) => {
    if (!window.confirm('確定要刪除這筆帳目嗎？(刪除後將無法復原)')) return;
    
    const syncDelete = async () => {
      try {
        const delPromise = deleteDoc(doc(db, 'muzi_debts_v4', debtId));
        const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000));
        await Promise.race([delPromise, timeout]);
        showToast('🗑️ 項目已成功刪除！', 'success');
      } catch (err) {
        showToast("⚠️ 刪除指令將在網路恢復時完成", 'error');
      }
    };

    syncDelete();
  };

  // 進入編輯模式
  const handleEditDebt = (debt) => {
    setFormName(debt.name);
    setFormAmount(debt.totalAmount.toString());
    setFormPeriods(debt.periods);
    const monthStr = String(debt.startMonth).padStart(2, '0');
    setFormStartDate(`${debt.startYear}-${monthStr}`);
    setEditingId(debt.id);
    setActiveTab('add');
  };

  // 🟢 極速版：儲存/新增項目 (瞬間切換畫面 + 背景同步)
  const handleSaveDebt = () => {
    if (!formName || !formAmount || !formStartDate) {
      showToast('請填寫完整資訊！', 'error');
      return;
    }
    
    const [year, month] = formStartDate.split('-');
    const isEdit = !!editingId;
    const targetId = editingId || Date.now().toString();
    
    const debtData = isEdit ? { 
      name: formName, 
      totalAmount: Number(formAmount), 
      periods: Number(formPeriods), 
      startYear: Number(year), 
      startMonth: Number(month)
    } : {
      id: targetId, 
      name: formName, 
      totalAmount: Number(formAmount), 
      periods: Number(formPeriods), 
      startYear: Number(year), 
      startMonth: Number(month), 
      paidPeriods: [] 
    };

    const syncToCloud = async () => {
      try {
        const savePromise = setDoc(doc(db, 'muzi_debts_v4', targetId), debtData, { merge: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
        await Promise.race([savePromise, timeoutPromise]);
        showToast(isEdit ? '✏️ 修改成功！已同步給對方' : '🎉 新增成功！對方已可看見', 'success');
      } catch (err) {
        console.error(err);
        if (err.message === 'timeout') {
          showToast("⚠️ 網路似乎偏慢，資料將在背景持續重試同步！", 'error');
        } else {
          showToast("⚠️ 雲端儲存發生異常", 'error');
        }
      }
    };

    syncToCloud();
    setActiveTab('list');
    resetForm();
  };

  const handleCancelEdit = () => {
    setActiveTab('list');
    resetForm();
  };

  const resetForm = () => {
    setFormName(''); 
    setFormAmount(''); 
    setFormPeriods(12); 
    setFormStartDate('');
    setEditingId(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex justify-center">
      
      {/* 🟢 浮動通知中心 (Toast) */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-full shadow-2xl font-bold text-sm flex items-center gap-3 animate-bounce transition-all whitespace-nowrap ${
          toast.type === 'error' ? 'bg-red-500 text-white shadow-red-500/30' : 'bg-slate-800 text-white shadow-slate-800/30'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} className="text-green-400" />}
          {toast.message}
        </div>
      )}

      {/* 嚴重錯誤阻擋畫面 */}
      {dbError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-100/90 backdrop-blur-sm p-6">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border-t-4 border-red-500">
            <h2 className="text-xl font-bold text-red-600 mb-3 flex items-center gap-2"><Database /> 雲端資料庫未就緒</h2>
            <p className="text-slate-600 mb-4 text-sm font-medium leading-relaxed">{dbError}</p>
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-slate-100 min-h-screen relative shadow-2xl flex flex-col">
        {/* 頂部標題 */}
        <header className="bg-white px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2 tracking-wide">
            <div className="bg-slate-800 text-white p-1.5 rounded-lg"><Users size={20} /></div>
            <div className="flex flex-col">
              <span>穆子李記帳本</span>
              {/* ⭐ 確認更新成功的視覺標籤 ⭐ */}
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold w-fit mt-0.5 border border-blue-200">v4.0 絕對同步版</span>
            </div>
          </h1>
          <div className="flex flex-col items-end gap-1">
            {/* 動態連線指示燈 */}
            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm transition-colors ${
              syncStatus === 'synced' ? 'text-green-500 bg-green-50 border-green-200' :
              syncStatus === 'connecting' ? 'text-yellow-500 bg-yellow-50 border-yellow-200' :
              'text-red-500 bg-red-50 border-red-200'
            }`}>
              {syncStatus === 'synced' ? <><CloudLightning size={12} className="fill-green-500" /> 已連線</> :
              syncStatus === 'connecting' ? <><Loader2 size={12} className="animate-spin" /> 連線中</> :
              <><WifiOff size={12} /> 雲端斷線</>}
            </div>
            {/* 手動強制重整按鈕 */}
            <button onClick={() => window.location.reload(true)} className="flex items-center gap-1 text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full hover:bg-slate-300">
              <RefreshCw size={10} /> 強制重整
            </button>
          </div>
        </header>

        {/* 內容區域 */}
        <main className="flex-1 overflow-y-auto pb-24">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="font-bold tracking-widest text-sm">正在連線專屬資料庫...</p>
            </div>
          ) : activeTab === 'list' ? (
            <div className="p-4 space-y-6 animate-fade-in">
              {/* 總結面板 */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={100} /></div>
                <p className="text-slate-300 text-sm font-medium mb-1 flex items-center gap-2"><CreditCard size={16} /> 目前總欠款餘額</p>
                <h1 className="text-4xl font-bold mb-6 text-red-400 tracking-tight">NT${outstandingBalance.toLocaleString()}</h1>
                <div className="flex justify-between border-t border-slate-700 pt-4">
                  <div><p className="text-slate-400 text-xs mb-1">原始總欠款</p><p className="font-semibold">NT${totalDebt.toLocaleString()}</p></div>
                  <div className="text-right"><p className="text-slate-400 text-xs mb-1">已共同還款</p><p className="font-semibold text-green-400">NT${totalPaid.toLocaleString()}</p></div>
                </div>
              </div>

              {/* 明細列表 */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-800 px-1 border-l-4 border-blue-500 pl-2">還款分期明細</h2>
                {debts.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400 flex flex-col items-center justify-center">
                    <Database size={40} className="text-slate-200 mb-3" />
                    資料庫是空的。<br/>點擊下方「新增項目」開始記帳吧！
                  </div>
                ) : debts.map(debt => {
                  const monthlyTotal = Math.round(debt.totalAmount / debt.periods);
                  const perPersonMonthly = Math.round(monthlyTotal / 2);
                  return (
                    <div key={debt.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg text-slate-800">{debt.name}</h3>
                            <button onClick={() => handleEditDebt(debt)} className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDeleteDebt(debt.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">總額 NT${debt.totalAmount.toLocaleString()} • 分 {debt.periods} 期</p>
                        </div>
                        <div className="bg-blue-100 text-blue-800 px-3 py-2 rounded-lg text-center shadow-inner">
                          <p className="text-[10px] font-bold flex items-center justify-center gap-1 mb-1 text-blue-600"><Users size={12} /> 一人一月</p>
                          <p className="text-xl font-black">NT${perPersonMonthly.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="grid grid-cols-3 gap-3">
                          {Array.from({ length: debt.periods }).map((_, index) => {
                            const isPaid = debt.paidPeriods.includes(index);
                            const monthLabel = getMonthString(debt.startYear, debt.startMonth, index);
                            return (
                              <button key={index} onClick={() => togglePaidStatus(debt.id, index)} className={`flex items-center gap-2 p-2 rounded-md transition-colors border ${isPaid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                {isPaid ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" /> : <Circle size={18} className="text-slate-300 flex-shrink-0" />}
                                <span className={`text-xs font-medium ${isPaid ? 'line-through opacity-70' : ''}`}>{monthLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                        
                        <div className="mt-6 mb-2">
                          <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">還款馬拉松</span>
                            <span className="text-xs text-slate-400 font-medium">{debt.paidPeriods.length} / {debt.periods} 期</span>
                          </div>
                          <div className="text-[11px] sm:text-xs font-bold text-blue-700 mb-4 bg-blue-50 py-2 px-1 rounded-lg text-center shadow-sm border border-blue-100 whitespace-nowrap tracking-tight overflow-hidden">
                            {debt.paidPeriods.length / debt.periods < 0.34 ? "🏃 起步：錢沒不見，只是變成你要的樣子！" : debt.paidPeriods.length / debt.periods < 0.67 ? "🐕 穩健：不知不覺已跨越三分之一，繼續保持！" : debt.paidPeriods.length / debt.periods < 1 ? "🔥 衝刺：快到終點了，未來的你會感謝努力的自己！" : "🎉 達陣：這場馬拉松順利完賽，給自己一個大擁抱！"}
                          </div>
                          <div className="flex items-center gap-2 relative h-12 px-1 mt-2">
                            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md border border-slate-200 z-10 flex-shrink-0"><span className="text-lg">🚩</span></div>
                            <div className="flex-1 relative h-3 bg-slate-200 rounded-full shadow-inner">
                              <div className="bg-gradient-to-r from-blue-400 to-indigo-500 h-full rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${(debt.paidPeriods.length / debt.periods) * 100}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-[70%] translate-x-1/2 z-20 flex flex-col items-center">
                                  <div className="animate-bounce drop-shadow-md text-2xl" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>🐶</div>
                                </div>
                              </div>
                            </div>
                            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md border border-slate-200 z-10 flex-shrink-0"><span className="text-lg">🏁</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6 animate-fade-in bg-slate-50 h-full">
              <h2 className="text-2xl font-bold text-slate-800 pt-2 border-l-4 border-blue-500 pl-3 mb-6">
                {editingId ? '編輯分期項目' : '新增分期項目'}
              </h2>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">欠款/項目名稱</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如：新車貸款、保險費" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:bg-white transition-colors text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">總金額 (元)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-400 font-medium">NT$</span>
                    <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="輸入總欠款" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-12 outline-none focus:border-blue-500 focus:bg-white transition-colors text-slate-800 font-bold text-lg" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">分期期數 (月)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 6, 9, 12].map(period => (
                      <button key={period} onClick={() => setFormPeriods(period)} className={`py-3 rounded-xl font-bold transition-all border ${formPeriods === period ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{period}期</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">開始攤提月份</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-4 top-3 text-slate-400" size={20} />
                    <input type="month" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-12 outline-none focus:border-blue-500 focus:bg-white transition-colors text-slate-800" />
                  </div>
                </div>
                {formAmount && formPeriods > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-blue-800"><Calculator size={18} /><span className="font-bold text-sm">每人每月需繳試算：</span></div>
                    <div className="text-xl font-black text-blue-600">NT${Math.round((Number(formAmount) / formPeriods) / 2).toLocaleString()}</div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 mt-auto">
                {editingId && (
                  <button onClick={handleCancelEdit} className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-4 rounded-xl shadow-sm transition-colors">
                    取消
                  </button>
                )}
                <button 
                  onClick={handleSaveDebt} 
                  className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg transition-colors flex justify-center items-center gap-2"
                >
                  {editingId ? <CheckCircle2 size={20} /> : <PlusCircle size={20} />} 
                  {editingId ? '儲存修改' : '新增雲端項目'}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* 底部導覽 */}
        <nav className="absolute bottom-0 w-full bg-white border-t border-slate-200 flex justify-around items-center pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20">
          <button onClick={() => { setActiveTab('list'); resetForm(); }} className={`flex flex-col items-center flex-1 py-3 transition-colors ${activeTab === 'list' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={24} className="mb-1" /><span className="text-[11px] font-bold">還款明細</span>
          </button>
          <button onClick={() => { setActiveTab('add'); resetForm(); }} className={`flex flex-col items-center flex-1 py-3 transition-colors ${activeTab === 'add' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <PlusCircle size={24} className="mb-1" /><span className="text-[11px] font-bold">新增項目</span>
          </button>
        </nav>
      </div>
    </div>
  );
}