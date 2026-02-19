import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';
import type { SpendingScope } from '../types';

interface ScopeManagerProps {
  scopes: SpendingScope[];
  onUpdateScopes: React.Dispatch<React.SetStateAction<SpendingScope[]>>;
  onDelete: (id: string) => void;
}

const presetColors = ['#D08C70', '#729B79', '#5B84B1', '#C97B63', '#E07A5F', '#B7ADA4'];

const ScopeManager: React.FC<ScopeManagerProps> = ({ scopes, onUpdateScopes, onDelete }) => {
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSortMode, setIsSortMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState(presetColors[0]);
  const [isSystem, setIsSystem] = useState(false);

  const openAdd = () => {
    setName('');
    setColor(presetColors[0]);
    setIsSystem(false);
    setEditingId(null);
    setFormMode('add');
  };

  const openEdit = (scope: SpendingScope) => {
    setName(scope.name);
    setColor(scope.color);
    setIsSystem(!!scope.isSystem);
    setEditingId(scope.id);
    setFormMode('edit');
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingId(null);
  };

  const moveScope = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    onUpdateScopes((prev) => {
      const list = [...prev];
      const fromIndex = list.findIndex((s) => s.id === fromId);
      const toIndex = list.findIndex((s) => s.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [item] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, item);
      return list;
    });
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (formMode === 'add') {
      const newScope: SpendingScope = { id: `scope_${Math.random().toString(36).slice(2, 8)}`, name: trimmed, color };
      onUpdateScopes((prev) => [...prev, newScope]);
    }

    if (formMode === 'edit' && editingId) {
      onUpdateScopes((prev) => prev.map((scope) => (scope.id === editingId ? { ...scope, name: scope.isSystem ? scope.name : trimmed, color } : scope)));
    }

    closeModal();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      onDelete(id);
      setDeleteConfirmId(null);
      return;
    }
    setDeleteConfirmId(id);
    window.setTimeout(() => setDeleteConfirmId((prev) => (prev === id ? null : prev)), 2500);
  };

  const autoScrollWhenDragging = (event: React.DragEvent) => {
    const topThreshold = 120;
    const bottomThreshold = window.innerHeight - 140;
    if (event.clientY < topThreshold) window.scrollBy({ top: -12, behavior: 'auto' });
    if (event.clientY > bottomThreshold) window.scrollBy({ top: 12, behavior: 'auto' });
  };

  return (
    <div className="custom-card p-6 md:p-8 rounded-[2.5rem] mb-12 space-y-8">
      {!isSortMode && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2"><span className="w-1.5 h-6 bg-[#5B84B1] rounded-full"></span>用途管理</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSortMode(true)} className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg tap-active bg-[#FAF7F2] text-[#6B6661] border border-[#E6DED6]">編輯排序</button>
            <button onClick={openAdd} className="px-5 py-2 bg-[#1A1A1A] rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg tap-active">+ 新增用途</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {scopes.map((scope) => {
          const isConfirming = deleteConfirmId === scope.id;
          const isDragging = draggingId === scope.id;
          return (
            <div
              key={scope.id}
              draggable={isSortMode}
              onDragStart={() => setDraggingId(scope.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => {
                if (!isSortMode || !draggingId || draggingId === scope.id) return;
                e.preventDefault();
                autoScrollWhenDragging(e);

                const dragIndex = scopes.findIndex((item) => item.id === draggingId);
                const hoverIndex = scopes.findIndex((item) => item.id === scope.id);
                if (dragIndex < 0 || hoverIndex < 0 || dragIndex === hoverIndex) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const middleY = rect.top + rect.height / 2;

                if (dragIndex < hoverIndex && e.clientY < middleY) return;
                if (dragIndex > hoverIndex && e.clientY > middleY) return;

                moveScope(draggingId, scope.id);
              }}
              onDrop={() => { if (isSortMode && draggingId) moveScope(draggingId, scope.id); }}
              className={`group relative flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all bg-white ${isDragging ? 'border-[#5B84B1] shadow-xl' : 'hover:border-[#5B84B1]/30'}`}
              style={{ borderColor: isDragging ? '#5B84B1' : `${scope.color}30` }}
              onClick={() => { if (!isSortMode) openEdit(scope); }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: scope.color }} />
              <span className="text-xs font-black text-[#1A1A1A] truncate flex-1">{scope.name}</span>
              {isSortMode && <LucideIcons.GripVertical size={14} className="text-[#5B84B1]" />}
              {!isSortMode && !scope.isSystem && (
                <button type="button" onClick={(e) => handleDeleteClick(e, scope.id)} className={`absolute -top-2 -right-2 flex items-center justify-center transition-all rounded-full shadow-md z-10 ${isConfirming ? 'w-auto px-2 py-1 bg-red-500 text-white h-auto' : 'w-6 h-6 bg-[#B7ADA4] text-white hover:bg-red-500'}`} title="刪除用途">
                  {isConfirming ? <span className="text-[9px] font-bold">確認刪除</span> : <LucideIcons.Trash2 size={12} strokeWidth={2.5} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isSortMode && <button onClick={() => { setIsSortMode(false); setDraggingId(null); }} className="fixed right-5 bottom-28 z-[60] h-12 px-5 rounded-2xl bg-[#5B84B1] text-white text-xs font-black shadow-2xl">儲存排序</button>}

      {formMode && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h4 className="text-sm font-black text-[#1A1A1A]">{formMode === 'add' ? '新增用途' : '編輯用途'}</h4>
              <button onClick={closeModal} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><LucideIcons.X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} placeholder="用途名稱，例如：家庭、朋友、社團" className="w-full h-11 px-4 rounded-xl border border-[#E6DED6] outline-none font-bold text-sm focus:border-[#5B84B1] disabled:bg-[#E6DED6]/30 disabled:text-[#B7ADA4]" />
              <div className="flex flex-wrap gap-2.5">
                {presetColors.map((item) => <button key={item} onClick={() => setColor(item)} className={`w-7 h-7 rounded-full transition-all ${color === item ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: item }} />)}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" placeholder="#5B84B1" />
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 rounded-xl border border-[#E6DED6] p-1" />
              </div>
              <button onClick={handleSave} className="w-full h-11 bg-[#1A1A1A] text-white rounded-xl font-black">儲存用途</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScopeManager;







