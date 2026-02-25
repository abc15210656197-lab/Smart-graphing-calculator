import React, { useState, useRef, useMemo } from 'react';
import { Camera, Keyboard, Trash2, Plus, Check, Loader2, Image as ImageIcon, Palette, Edit2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InlineMath } from 'react-katex';
import * as math from 'mathjs';
import 'katex/dist/katex.min.css';
import GraphView from './components/GraphView';
import MathKeyboard from './components/MathKeyboard';
import { extractFunctionsFromImage } from './services/geminiService';

interface FunctionItem {
  id: string;
  expression: string;
  visible: boolean;
  color: string;
}

interface Parameter {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

const COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
];

const TRANSLATIONS = {
  zh: {
    subtitle: '智能函数绘图仪',
    manualInput: '手动输入',
    photoScan: '拍照识别',
    inputPlaceholder: '输入函数, 如: x^2 + 2x + 1',
    editing: '编辑中',
    paramControl: '参数控制',
    clearAll: '清除所有',
    range: '范围:',
    fastMode: '快速模式',
    preciseMode: '精确模式',
    uploadPrompt: '点击或拖拽上传照片',
    uploadDesc: '支持包含数学公式的照片识别',
    scanning: '正在识别图像中的函数...',
    scanResults: '识别结果',
    selectAll: '全选',
    deselectAll: '取消全选',
    reupload: '重新上传',
    addSelected: '添加选中项',
  },
  en: {
    subtitle: 'Smart Graphing Calculator',
    manualInput: 'Manual Input',
    photoScan: 'Photo Scan',
    inputPlaceholder: 'Enter function, e.g. x^2 + 2x + 1',
    editing: 'Editing',
    paramControl: 'Parameters',
    clearAll: 'Clear All',
    range: 'Range:',
    fastMode: 'Fast Mode',
    preciseMode: 'Precise Mode',
    uploadPrompt: 'Click or drag to upload photo',
    uploadDesc: 'Supports math formula recognition',
    scanning: 'Recognizing functions in image...',
    scanResults: 'Scan Results',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    reupload: 'Re-upload',
    addSelected: 'Add Selected',
  }
};

export default function App() {
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const t = TRANSLATIONS[language];
  const [functions, setFunctions] = useState<FunctionItem[]>([]);
  const [parameters, setParameters] = useState<Record<string, Parameter>>({});
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manual' | 'photo'>('manual');
  const [scanMode, setScanMode] = useState<'fast' | 'precise'>('fast');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResults, setScannedResults] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFunction = (expr: string) => {
    if (!expr.trim()) return;
    
    // Detect parameters
    detectParameters(expr);

    if (editingId) {
      setFunctions(functions.map(f => f.id === editingId ? { ...f, expression: expr } : f));
      setEditingId(null);
    } else {
      const newFunc: FunctionItem = {
        id: Math.random().toString(36).substr(2, 9),
        expression: expr,
        visible: true,
        color: COLORS[functions.length % COLORS.length]
      };
      setFunctions([...functions, newFunc]);
    }
    setInputValue('');
  };

  const startEditing = (f: FunctionItem) => {
    setEditingId(f.id);
    setInputValue(f.expression);
    setActiveTab('manual');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const insertAtCursor = (text: string) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    
    let newValue = '';
    let newCursorPos = start + text.length;

    if (text === 'frac') {
      const template = '()/()';
      newValue = inputValue.substring(0, start) + template + inputValue.substring(end);
      newCursorPos = start + 1; // Position inside the first parenthesis
    } else if (text === 'sqrt(' || text === 'abs(' || text === 'log(' || text === 'sin(' || text === 'cos(' || text === 'tan(') {
      const template = text + ')';
      newValue = inputValue.substring(0, start) + template + inputValue.substring(end);
      newCursorPos = start + text.length;
    } else {
      newValue = inputValue.substring(0, start) + text + inputValue.substring(end);
      newCursorPos = start + text.length;
    }

    setInputValue(newValue);
    setTimeout(() => {
      input.selectionStart = input.selectionEnd = newCursorPos;
      input.focus();
    }, 0);
  };

  const deleteAtCursor = () => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    if (start === end && start > 0) {
      const newValue = inputValue.substring(0, start - 1) + inputValue.substring(end);
      setInputValue(newValue);
      setTimeout(() => {
        input.selectionStart = input.selectionEnd = start - 1;
        input.focus();
      }, 0);
    } else if (start !== end) {
      const newValue = inputValue.substring(0, start) + inputValue.substring(end);
      setInputValue(newValue);
      setTimeout(() => {
        input.selectionStart = input.selectionEnd = start;
        input.focus();
      }, 0);
    }
  };

  const moveCursor = (dir: 'left' | 'right') => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    if (dir === 'left' && start > 0) {
      input.selectionStart = input.selectionEnd = start - 1;
    } else if (dir === 'right' && start < inputValue.length) {
      input.selectionStart = input.selectionEnd = start + 1;
    }
    input.focus();
  };

  const detectParameters = (expr: string) => {
    try {
      const node = math.parse(expr.replace(/f\(x\)\s*=/g, '').replace(/y\s*=/g, ''));
      const variables = new Set<string>();
      node.traverse((n: any) => {
        if (n.type === 'SymbolNode' && !['x', 'y', 'e', 'pi', 'PI', 'phi', 'i'].includes(n.name)) {
          try {
            if (typeof (math as any)[n.name] !== 'function') {
              variables.add(n.name);
            }
          } catch {
            variables.add(n.name);
          }
        }
      });

      const newParams = { ...parameters };
      let changed = false;
      variables.forEach(v => {
        if (!newParams[v]) {
          newParams[v] = { name: v, value: 1, min: -10, max: 10, step: 0.1 };
          changed = true;
        }
      });
      if (changed) setParameters(newParams);
    } catch (e) {
      console.error("Parameter detection failed", e);
    }
  };

  const updateParameter = (name: string, updates: Partial<Parameter>) => {
    setParameters(prev => ({
      ...prev,
      [name]: { ...prev[name], ...updates }
    }));
  };

  const removeParameter = (name: string) => {
    const newParams = { ...parameters };
    delete newParams[name];
    setParameters(newParams);
  };

  const removeFunction = (id: string) => {
    setFunctions(functions.filter(f => f.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setInputValue('');
    }
  };

  const toggleVisibility = (id: string) => {
    setFunctions(functions.map(f => f.id === id ? { ...f, visible: !f.visible } : f));
  };

  const updateColor = (id: string, color: string) => {
    setFunctions(functions.map(f => f.id === id ? { ...f, color } : f));
    setShowColorPicker(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const results = await extractFunctionsFromImage(base64, file.type, scanMode);
      setScannedResults(results);
      setSelectedIndices(new Set(results.map((_, i) => i)));
      setIsScanning(false);
    };
    reader.readAsDataURL(file);
  };

  const toggleScannedSelection = (index: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) newSelection.delete(index);
    else newSelection.add(index);
    setSelectedIndices(newSelection);
  };

  const addScannedFunctions = (selected: string[]) => {
    const newFuncs = selected.map((expr, i) => ({
      id: Math.random().toString(36).substr(2, 9) + i,
      expression: expr,
      visible: true,
      color: COLORS[(functions.length + i) % COLORS.length]
    }));
    setFunctions([...functions, ...newFuncs]);
    setScannedResults([]);
    setSelectedIndices(new Set());
  };

  const toLatex = (expr: string) => {
    try {
      let cleanExpr = expr.trim();
      if (!cleanExpr) return '';
      
      const parts = cleanExpr.split('=');
      let left = 'y';
      let right = cleanExpr;
      
      if (parts.length > 1) {
        left = parts[0].trim();
        right = parts[1].trim();
      }

      let processedRight = right
        .replace(/log2\(([^)]+)\)/g, 'log($1, 2)')
        .replace(/log10\(([^)]+)\)/g, 'log($1, 10)')
        .replace(/log_b\(([^,]+),([^)]+)\)/g, 'log($1, $2)');

      const node = math.parse(processedRight);
      let tex = node.toTex({ parenthesis: 'keep', implicit: 'hide' });
      
      if (parts.length > 1) {
        return `${left} = ${tex}`;
      }
      return tex;
    } catch (e) {
      return expr
        .replace(/\//g, '\\div ')
        .replace(/\*/g, '\\cdot ')
        .replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}')
        .replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 flex flex-col max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            GraphIt
            <button 
              onClick={() => setLanguage(lang => lang === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1 text-xs font-medium bg-slate-200 text-slate-600 px-2 py-1 rounded-md hover:bg-slate-300 transition-colors"
            >
              <Globe size={14} />
              {language === 'zh' ? 'EN' : '中'}
            </button>
          </h1>
          <p className="text-slate-500 text-sm">{t.subtitle}</p>
        </div>
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'manual' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Keyboard size={18} />
            {t.manualInput}
          </button>
          <button
            onClick={() => setActiveTab('photo')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'photo' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Camera size={18} />
            {t.photoScan}
          </button>
        </div>
      </header>

      {/* Graph Area */}
      <div className="h-[40vh] min-h-[300px] w-full relative z-10">
        <GraphView 
          functions={functions.filter(f => f.visible).map(f => ({ expression: f.expression, color: f.color }))} 
          parameters={parameters}
        />
      </div>

      <main className="flex flex-col mt-2 gap-4">
        {/* Functions List - Now in the middle, tight to graph */}
        <div className="flex flex-col gap-2">
          {functions.length > 0 && functions.map((f) => (
            <div 
              key={f.id}
              className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow relative"
            >
              <div className="flex items-center gap-3 flex-1 overflow-hidden">
                <button 
                  onClick={() => toggleVisibility(f.id)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${f.visible ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}
                >
                  {f.visible && <Check size={12} />}
                </button>
                <div className="flex flex-col overflow-x-auto py-1 scrollbar-hide">
                  <div className="text-lg" style={{ color: f.color }}>
                    <InlineMath math={toLatex(f.expression)} />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={() => startEditing(f)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-slate-100"
                  title="Edit Function"
                >
                  <Edit2 size={18} />
                </button>

                <div className="relative">
                  <button 
                    onClick={() => setShowColorPicker(showColorPicker === f.id ? null : f.id)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-slate-100"
                    title="Change Color"
                  >
                    <Palette size={18} />
                  </button>
                  
                  <AnimatePresence>
                    {showColorPicker === f.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-white p-2 rounded-xl shadow-xl border border-slate-200 z-50 grid grid-cols-5 gap-1 w-40"
                      >
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => updateColor(f.id, color)}
                            className="w-6 h-6 rounded-full border border-black/5 transition-transform hover:scale-110 active:scale-95"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <button 
                  onClick={() => removeFunction(f.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Input Section - Now at the bottom */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <AnimatePresence mode="wait">
            {activeTab === 'manual' ? (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-4"
              >
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={t.inputPlaceholder}
                      inputMode="none"
                      className={`w-full bg-slate-50 border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono ${editingId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'}`}
                      onKeyDown={(e) => e.key === 'Enter' && addFunction(inputValue)}
                    />
                    {editingId && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{t.editing}</span>
                        <button 
                          onClick={() => { setEditingId(null); setInputValue(''); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addFunction(inputValue)}
                    className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95 flex items-center justify-center min-w-[52px]"
                  >
                    {editingId ? <Check size={24} /> : <Plus size={24} />}
                  </button>
                </div>

                {/* Parameter Sliders */}
                {Object.keys(parameters).length > 0 && (
                  <div className="mt-2 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.paramControl}</h3>
                      <button 
                        onClick={() => setParameters({})}
                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                      >
                        {t.clearAll}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.values(parameters).map((param: Parameter) => (
                        <div key={param.name} className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded text-xs border border-indigo-100">{param.name}</span>
                              <span className="font-mono text-xs text-slate-700">{param.value.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center bg-white rounded-md px-1.5 py-0.5 border border-slate-100">
                                <span className="text-[10px] text-slate-400 mr-1 hidden sm:inline">{t.range}</span>
                                <input 
                                  type="number" 
                                  value={param.min}
                                  onChange={(e) => updateParameter(param.name, { min: parseFloat(e.target.value) || 0 })}
                                  className="w-8 bg-transparent text-[10px] font-mono focus:outline-none text-center"
                                />
                                <span className="text-slate-300 text-[10px]">~</span>
                                <input 
                                  type="number" 
                                  value={param.max}
                                  onChange={(e) => updateParameter(param.name, { max: parseFloat(e.target.value) || 0 })}
                                  className="w-8 bg-transparent text-[10px] font-mono focus:outline-none text-center"
                                />
                              </div>
                              <button 
                                onClick={() => removeParameter(param.name)}
                                className="text-slate-300 hover:text-slate-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <input 
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={param.value}
                            onChange={(e) => updateParameter(param.name, { value: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <MathKeyboard 
                  onKeyClick={insertAtCursor}
                  onDelete={deleteAtCursor}
                  onClear={() => setInputValue('')}
                  onMoveCursor={moveCursor}
                />
              </motion.div>
            ) : (
              <motion.div
                key="photo"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-6 py-4"
              >
                <div className="flex bg-slate-100 p-1 rounded-xl self-center">
                  <button
                    onClick={() => setScanMode('fast')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scanMode === 'fast' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t.fastMode}
                  </button>
                  <button
                    onClick={() => setScanMode('precise')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scanMode === 'precise' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t.preciseMode}
                  </button>
                </div>

                {!isScanning && scannedResults.length === 0 ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                  >
                    <div className="bg-indigo-100 text-indigo-600 p-4 rounded-full group-hover:scale-110 transition-transform">
                      <ImageIcon size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-slate-700">{t.uploadPrompt}</p>
                      <p className="text-slate-400 text-sm">{t.uploadDesc}</p>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                ) : isScanning ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <Loader2 className="animate-spin text-indigo-600" size={48} />
                    <p className="text-slate-600 font-medium animate-pulse">{t.scanning}</p>
                  </div>
                ) : (
                  <div className="w-full flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700">{t.scanResults}</h3>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            if (selectedIndices.size === scannedResults.length) setSelectedIndices(new Set());
                            else setSelectedIndices(new Set(scannedResults.map((_, i) => i)));
                          }}
                          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          {selectedIndices.size === scannedResults.length ? t.deselectAll : t.selectAll}
                        </button>
                        <button 
                          onClick={() => setScannedResults([])}
                          className="text-sm text-slate-400 hover:text-slate-600"
                        >
                          {t.reupload}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {scannedResults.map((res, i) => (
                        <div 
                          key={i}
                          className={`flex items-center justify-between bg-slate-50 border p-4 rounded-xl transition-all cursor-pointer ${selectedIndices.has(i) ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200'}`}
                          onClick={() => toggleScannedSelection(i)}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedIndices.has(i) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                              {selectedIndices.has(i) && <Check size={12} />}
                            </div>
                            <div className="text-lg overflow-x-auto py-1 scrollbar-hide">
                              <InlineMath math={toLatex(res)} />
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); addScannedFunctions([res]); }}
                            className="bg-indigo-100 text-indigo-600 p-2 rounded-lg hover:bg-indigo-200 transition-all shrink-0"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {scannedResults.length > 0 && (
                      <button
                        onClick={() => addScannedFunctions(scannedResults.filter((_, i) => selectedIndices.has(i)))}
                        disabled={selectedIndices.size === 0}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-md mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t.addSelected} ({selectedIndices.size})
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );

}
