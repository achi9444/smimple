import React, { useState } from 'react';
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

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('ShoppingBag');
  const [color, setColor] = useState('#D08C70');
  const [type, setType] = useState<TransactionType>('expense');
  const [isSystem, setIsSystem] = useState(false);

  const presetIcons = [
    'ShoppingBag', 'Utensils', 'Car', 'Home', 'Gamepad2', 'Activity', 'Layers', 'Banknote',
    'Gift', 'TrendingUp', 'Heart', 'Music', 'Coffee', 'Book', 'Camera', 'Tv', 'Dumbbell',
    'Plane', 'Umbrella', 'Scissors', 'Briefcase', 'GraduationCap', 'Shirt', 'Smartphone'
  ];

  const displayPresetColors = ['#FF5A5F', '#FF8C00', '#4CAF50', '#2196F3', '#9C27B0', '#795548', '#FFD700', '#00BCD4'];

  const renderIcon = (iconName: string, iconColor: string, size = 18, stroke = 2) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={stroke} style={{ color: iconColor }} />;
  };

  const handleOpenAdd = () => {
    setName('');
    setIcon('ShoppingBag');
    setColor('#D08C70');
    setType('expense');
    setIsSystem(false);
    setShowForm('add');
  };

  const handleSave = () => {
    if (!name.trim()) return;

    if (showForm === 'add') {
      onUpdateCategories((prev) => [
        ...prev,
        {
          id: `cat_${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim(),
          icon,
          color,
          type,
          isSystem: false,
        },
      ]);
    } else if (showForm === 'edit' && editingCatId) {
      onUpdateCategories((prev) =>
        prev.map((c) => (c.id === editingCatId ? { ...c, name: isSystem ? c.name : name.trim(), icon, color, type } : c))
      );
    }

    setShowForm(null);
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

  const CategorySection = ({ title, list, sectionType }: { title: string; list: Category[]; sectionType: TransactionType }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className={`w-1.5 h-4 rounded-full ${sectionType === 'income' ? 'bg-[#729B79]' : 'bg-[#E07A5F]'}`}></div>
        <h4 className="text-[11px] font-black text-[#6B6661] uppercase tracking-[0.2em]">{title}</h4>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {list.map((cat) => {
          const isConfirming = deleteConfirmId === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => {
                setEditingCatId(cat.id);
                setName(cat.name);
                setIcon(cat.icon);
                setColor(cat.color);
                setType(cat.type || 'expense');
                setIsSystem(!!cat.isSystem);
                setShowForm('edit');
              }}
              className="group relative flex flex-row items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all cursor-pointer bg-white hover:border-[#D08C70]/30"
              style={{ borderColor: `${cat.color}30` }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${cat.color}15` }}>
                {renderIcon(cat.icon, cat.color)}
              </div>
              <span className="text-xs font-black text-[#1A1A1A] truncate flex-1">{cat.name}</span>

              {!cat.isSystem && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteCategory(e, cat.id)}
                  className={`absolute -top-2 -right-2 flex items-center justify-center transition-all rounded-full shadow-md z-10 ${
                    isConfirming ? 'w-auto px-2 py-1 bg-red-500 text-white h-auto' : 'w-6 h-6 bg-[#B7ADA4] text-white hover:bg-red-500'
                  }`}
                  title="刪除分類"
                >
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
    <div className="custom-card p-6 md:p-8 rounded-[2.5rem] mb-12 space-y-10">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#D08C70] rounded-full"></span>
          分類管理
        </h3>
        <button onClick={handleOpenAdd} className="px-5 py-2 bg-[#1A1A1A] rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg tap-active">
          + 新增分類
        </button>
      </div>

      {showForm && (
        <div className="p-8 bg-[#FAF7F2] rounded-[2rem] border-2 border-[#E6DED6] space-y-6 animate-in slide-in-from-top-4 relative shadow-inner">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[#D08C70] uppercase tracking-widest">{showForm === 'add' ? '新增分類' : '編輯分類'}</span>
            <button onClick={() => setShowForm(null)} className="text-[#B7ADA4] hover:text-red-500">關閉</button>
          </div>
          <div className="space-y-4">
            <div className="flex p-1 bg-white rounded-xl border border-[#E6DED6]">
              <button onClick={() => setType('expense')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${type === 'expense' ? 'bg-[#D66D5B] text-white shadow-md' : 'text-[#B7ADA4]'}`}>支出</button>
              <button onClick={() => setType('income')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${type === 'income' ? 'bg-[#729B79] text-white shadow-md' : 'text-[#B7ADA4]'}`}>收入</button>
            </div>

            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} placeholder="分類名稱" className="w-full px-5 py-3 rounded-xl border border-[#E6DED6] outline-none font-bold text-sm focus:border-[#D08C70] disabled:bg-[#E6DED6]/30 disabled:text-[#B7ADA4]" />

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-32 overflow-y-auto no-scrollbar p-1">
              {presetIcons.map((item) => (
                <button key={item} onClick={() => setIcon(item)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${icon === item ? 'bg-[#1A1A1A] scale-110' : 'bg-white border border-[#E6DED6]'}`}>
                  {renderIcon(item, icon === item ? '#FFF' : '#B7ADA4', 20, 1.5)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {displayPresetColors.map((item) => (
                <button key={item} onClick={() => setColor(item)} className={`w-7 h-7 rounded-full transition-all ${color === item ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: item }} />
              ))}
              <div className="relative w-7 h-7">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <div className={`w-full h-full rounded-full transition-all border border-dashed border-[#B7ADA4] flex items-center justify-center ${!displayPresetColors.includes(color) ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: !displayPresetColors.includes(color) ? color : 'transparent' }}>
                  <LucideIcons.Plus size={14} className={!displayPresetColors.includes(color) ? 'text-white mix-blend-difference' : 'text-[#B7ADA4]'} />
                </div>
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">儲存分類</button>
          </div>
        </div>
      )}

      <div className="space-y-10">
        <CategorySection title="支出分類" list={categories.filter((c) => c.type === 'expense' || !c.type)} sectionType="expense" />
        <CategorySection title="收入分類" list={categories.filter((c) => c.type === 'income')} sectionType="income" />
      </div>
    </div>
  );
};

export default CategoryManager;
