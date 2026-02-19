import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import type { Category, TransactionType } from '../types';

interface CategoryManagerProps {
  categories: Category[];
  onUpdateCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  onDelete: (id: string) => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ categories, onUpdateCategories, onDelete }) => {
  const [showForm, setShowForm] = useState<'add' | 'edit' | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSortMode, setIsSortMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('ShoppingBag');
  const [color, setColor] = useState('#D08C70');
  const [type, setType] = useState<TransactionType>('expense');
  const [isSystem, setIsSystem] = useState(false);

  const presetIcons = ['ShoppingBag', 'Utensils', 'Car', 'Home', 'Gamepad2', 'Activity', 'Layers', 'Banknote', 'Gift', 'TrendingUp', 'Heart', 'Music', 'Coffee', 'Book', 'Camera', 'Tv', 'Dumbbell', 'Plane', 'Umbrella', 'Scissors', 'Briefcase', 'GraduationCap', 'Shirt', 'Smartphone'];
  const displayPresetColors = ['#FF5A5F', '#FF8C00', '#4CAF50', '#2196F3', '#9C27B0', '#795548', '#FFD700', '#00BCD4'];

  const expenseCategories = useMemo(() => categories.filter((c) => (c.type || 'expense') === 'expense'), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.type === 'income'), [categories]);

  const renderIcon = (iconName: string, iconColor: string, size = 18, stroke = 2) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={stroke} style={{ color: iconColor }} />;
  };

  const openAdd = () => {
    setName('');
    setIcon('ShoppingBag');
    setColor('#D08C70');
    setType('expense');
    setIsSystem(false);
    setEditingCatId(null);
    setShowForm('add');
  };

  const openEdit = (cat: Category) => {
    setEditingCatId(cat.id);
    setName(cat.name);
    setIcon(cat.icon);
    setColor(cat.color);
    setType(cat.type || 'expense');
    setIsSystem(!!cat.isSystem);
    setShowForm('edit');
  };

  const closeModal = () => {
    setShowForm(null);
    setEditingCatId(null);
  };

  const autoScrollWhenDragging = (event: React.DragEvent) => {
    const topThreshold = 120;
    const bottomThreshold = window.innerHeight - 140;
    if (event.clientY < topThreshold) window.scrollBy({ top: -12, behavior: 'auto' });
    if (event.clientY > bottomThreshold) window.scrollBy({ top: 12, behavior: 'auto' });
  };

  const moveCategory = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    onUpdateCategories((prev) => {
      const list = [...prev];
      const fromIndex = list.findIndex((c) => c.id === fromId);
      const toIndex = list.findIndex((c) => c.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [item] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, item);
      return list;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (showForm === 'add') {
      onUpdateCategories((prev) => [...prev, { id: `cat_${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), icon, color, type, isSystem: false }]);
    } else if (showForm === 'edit' && editingCatId) {
      onUpdateCategories((prev) => prev.map((c) => (c.id === editingCatId ? { ...c, name: isSystem ? c.name : name.trim(), icon, color, type } : c)));
    }
    closeModal();
  };

  const handleDeleteCategory = (e: React.MouseEvent, catId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleteConfirmId === catId) {
      onDelete(catId);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(catId);
      setTimeout(() => setDeleteConfirmId((prev) => (prev === catId ? null : prev)), 3000);
    }
  };

  const renderSection = (title: string, sectionType: 'expense' | 'income', data: Category[]) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="w-1.5 h-4 rounded-full" style={{ backgroundColor: sectionType === 'expense' ? '#D66D5B' : '#729B79' }} />
        <h4 className="text-[11px] font-black text-[#6B6661] uppercase tracking-[0.18em]">{title}</h4>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.map((cat) => {
          const isConfirming = deleteConfirmId === cat.id;
          const isDragging = draggingId === cat.id;
          return (
            <div
              key={cat.id}
              draggable={isSortMode}
              onDragStart={() => setDraggingId(cat.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => {
                if (!isSortMode || !draggingId || draggingId === cat.id) return;
                e.preventDefault();
                autoScrollWhenDragging(e);

                const dragIndex = data.findIndex((item) => item.id === draggingId);
                const hoverIndex = data.findIndex((item) => item.id === cat.id);
                if (dragIndex < 0 || hoverIndex < 0 || dragIndex === hoverIndex) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const middleY = rect.top + rect.height / 2;

                if (dragIndex < hoverIndex && e.clientY < middleY) return;
                if (dragIndex > hoverIndex && e.clientY > middleY) return;

                moveCategory(draggingId, cat.id);
              }}
              onDrop={() => { if (isSortMode && draggingId) moveCategory(draggingId, cat.id); }}
              onClick={() => { if (!isSortMode) openEdit(cat); }}
              className={`group relative flex flex-row items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all bg-white ${isDragging ? 'border-[#D08C70] shadow-xl' : 'hover:border-[#D08C70]/30'}`}
              style={{ borderColor: isDragging ? '#D08C70' : `${cat.color}30` }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${cat.color}15` }}>{renderIcon(cat.icon, cat.color)}</div>
              <span className="text-xs font-black text-[#1A1A1A] truncate flex-1">{cat.name}</span>
              {isSortMode && <LucideIcons.GripVertical size={14} className="text-[#D08C70]" />}
              {!isSortMode && !cat.isSystem && (
                <button type="button" onClick={(e) => handleDeleteCategory(e, cat.id)} className={`absolute -top-2 -right-2 flex items-center justify-center transition-all rounded-full shadow-md z-10 ${isConfirming ? 'w-auto px-2 py-1 bg-red-500 text-white h-auto' : 'w-6 h-6 bg-[#B7ADA4] text-white hover:bg-red-500'}`} title="刪除分類">
                  {isConfirming ? <span className="text-[9px] font-bold">確認刪除</span> : <LucideIcons.Trash2 size={12} strokeWidth={2.5} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="custom-card p-6 md:p-8 rounded-[2.5rem] mb-12 space-y-8">
      {!isSortMode && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2"><span className="w-1.5 h-6 bg-[#D08C70] rounded-full"></span>分類管理</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSortMode(true)} className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg tap-active bg-[#FAF7F2] text-[#6B6661] border border-[#E6DED6]">編輯排序</button>
            <button onClick={openAdd} className="px-5 py-2 bg-[#1A1A1A] rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg tap-active">+ 新增分類</button>
          </div>
        </div>
      )}

      {renderSection('支出分類', 'expense', expenseCategories)}
      {renderSection('收入分類', 'income', incomeCategories)}

      {isSortMode && <button onClick={() => { setIsSortMode(false); setDraggingId(null); }} className="fixed right-5 bottom-28 z-[60] h-12 px-5 rounded-2xl bg-[#D08C70] text-white text-xs font-black shadow-2xl">儲存排序</button>}

      {showForm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-[#E6DED6] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E6DED6] px-5 py-4 sticky top-0 bg-white z-10">
              <span className="text-sm font-black text-[#D08C70]">{showForm === 'add' ? '新增分類' : '編輯分類'}</span>
              <button onClick={closeModal} className="text-[#B7ADA4] hover:text-red-500"><LucideIcons.X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex p-1 bg-white rounded-xl border border-[#E6DED6]">
                <button onClick={() => setType('expense')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${type === 'expense' ? 'bg-[#D66D5B] text-white shadow-md' : 'text-[#B7ADA4]'}`}>支出</button>
                <button onClick={() => setType('income')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${type === 'income' ? 'bg-[#729B79] text-white shadow-md' : 'text-[#B7ADA4]'}`}>收入</button>
              </div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} placeholder="分類名稱" className="w-full h-11 px-4 rounded-xl border border-[#E6DED6] outline-none font-bold text-sm focus:border-[#D08C70] disabled:bg-[#E6DED6]/30 disabled:text-[#B7ADA4]" />
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-32 overflow-y-auto no-scrollbar p-1">
                {presetIcons.map((item) => <button key={item} onClick={() => setIcon(item)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${icon === item ? 'bg-[#1A1A1A] scale-110' : 'bg-white border border-[#E6DED6]'}`}>{renderIcon(item, icon === item ? '#FFF' : '#B7ADA4', 20, 1.5)}</button>)}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {displayPresetColors.map((item) => <button key={item} onClick={() => setColor(item)} className={`w-7 h-7 rounded-full transition-all ${color === item ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: item }} />)}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" placeholder="#D08C70" />
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 rounded-xl border border-[#E6DED6] p-1" />
              </div>
              <button onClick={handleSave} className="w-full h-11 bg-[#1A1A1A] text-white rounded-xl font-black">儲存分類</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;


