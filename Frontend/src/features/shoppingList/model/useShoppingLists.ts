// Frontend\src\features\shoppingList\model\useShoppingLists.ts
import { useState, useMemo, useEffect } from 'react';
import { ShoppingListData } from './shopping.types';

type PersistFn = (lists: ShoppingListData[]) => void;
type DeleteFn = (deletedId: number, remaining: ShoppingListData[]) => void;

// כולל isOwner כדי לאפשר עדכון מטא מלא כשצריך
type ShareMetaPatch = Partial<
  Pick<ShoppingListData, 'isShared' | 'sharedWith' | 'shareStatus' | 'isOwner'>
>;

/** נרמול שיתוף לשותף יחיד + סנכרון isShared */
function normalizeShareMeta<T extends Partial<ShoppingListData>>(l: T): T {
  const clone: any = { ...l };

  if ('sharedWith' in clone && Array.isArray(clone.sharedWith)) {
    // שומרים רק 0..1 שותף
    clone.sharedWith = clone.sharedWith.slice(0, 1);
  }

  if ('sharedWith' in clone) {
    const count = Array.isArray(clone.sharedWith) ? clone.sharedWith.length : 0;
    // אם isShared לא נשלח מפורשות — קובע לפי sharedWith
    if (!('isShared' in clone)) {
      clone.isShared = count > 0;
    } else {
      // אם הגיע isShared מפורשות, תן לו עדיפות—אבל נוודא קונסיסטנטיות
      if (clone.isShared && count === 0) {
        // אין שותף אבל מסומן isShared=true → תהפוך ל-false כדי למנוע מצב לא עקבי
        clone.isShared = false;
      }
    }
  }

  return clone;
}

export function useShoppingLists(
  initial: ShoppingListData[] = [],
  onPersist?: PersistFn, // לשמירת רשימות/סדר
  onDelete?: DeleteFn,   // מחיקה בענן (או leave לפי ה־Container)
) {
  const [lists, setLists] = useState<ShoppingListData[]>(
    [...initial].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // התמדה כללית של שינויים (rename / reorder / add / items וכו')
  useEffect(() => {
    onPersist?.(lists);
  }, [lists, onPersist]);

  const currentList = useMemo(
    () => lists.find(l => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const addList = (name: string) => {
    if (!name.trim()) return;
    setLists(prev => {
      const nextOrder =
        prev.length === 0 ? 0 : Math.max(...prev.map(l => l.order ?? -1)) + 1;
      // יוצר מקומי: סביר להניח שהוא הבעלים
      return [
        ...prev,
        { id: Date.now(), name, items: [], order: nextOrder, isOwner: true, isShared: false, sharedWith: [] },
      ];
    });
  };

  const deleteList = (listId: number) => {
    setLists(prev => {
      const filtered = prev.filter(l => l.id !== listId);
      const reindexed = filtered
        .sort((a, b) => a.order - b.order)
        .map((l, idx) => ({ ...l, order: idx }));
      onDelete?.(listId, reindexed);
      return reindexed;
    });
    if (selectedListId === listId) setSelectedListId(null);
  };

  const renameList = (listId: number, name: string) => {
    if (!name.trim()) return;
    setLists(prev => prev.map(l => (l.id === listId ? { ...l, name } : l)));
  };

  // --- פריטים ---
  const addItem = (listId: number, name: string) => {
    if (!name.trim()) return;
    setLists(prev =>
      prev.map(l =>
        l.id === listId
          ? { ...l, items: [...l.items, { id: Date.now(), name, checked: false }] }
          : l
      )
    );
  };

  const deleteItem = (listId: number, itemId: number) => {
    setLists(prev =>
      prev.map(l =>
        l.id === listId ? { ...l, items: l.items.filter(i => i.id !== itemId) } : l
      )
    );
  };

  const toggleItem = (listId: number, itemId: number) => {
    setLists(prev =>
      prev.map(l =>
        l.id === listId
          ? {
              ...l,
              items: l.items.map(i => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
            }
          : l
      )
    );
  };

  const clearCompleted = (listId: number) => {
    setLists(prev =>
      prev.map(l =>
        l.id === listId ? { ...l, items: l.items.filter(i => !i.checked) } : l
      )
    );
  };

  const reorderLists = (sourceIndex: number, destIndex: number) => {
    if (sourceIndex === destIndex) return;
    setLists(prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const [moved] = arr.splice(sourceIndex, 1);
      arr.splice(destIndex, 0, moved);
      return arr.map((l, idx) => ({ ...l, order: idx }));
    });
  };

  const moveListBefore = (movedId: number, beforeId: number | null) => {
    setLists(prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const from = arr.findIndex(l => l.id === movedId);
      if (from < 0) return prev;
      const [moved] = arr.splice(from, 1);
      const to = beforeId === null ? arr.length : arr.findIndex(l => l.id === beforeId);
      const insertAt = to < 0 ? arr.length : to;
      arr.splice(insertAt, 0, moved);
      return arr.map((l, idx) => ({ ...l, order: idx }));
    });
  };

  // --- 🔗 עזרה לשיתוף (Frontend <-> API) ---
  /** מחליף רשימה מעודכנת מהשרת (כולל שדות השיתוף) עם נרמול 0..1 שותף */
  const replaceList = (updated: ShoppingListData) => {
    const normalized = normalizeShareMeta(updated);
    setLists(prev =>
      prev.some(l => l.id === normalized.id)
        ? prev.map(l => (l.id === normalized.id ? { ...l, ...normalized } : l))
        : [...prev, normalized]
    );
  };

  /** עדכון מטא־דאטה לשיתוף מקומית (למשל אופטימיות "pending") – עם נרמול 0..1 */
  const updateShareMeta = (listId: number, meta: ShareMetaPatch) => {
    const normalized = normalizeShareMeta(meta);
    setLists(prev => prev.map(l => (l.id === listId ? { ...l, ...normalized } : l)));
  };

  /** עזרת אופטימיות: סימון משותפת מקומית לשותף יחיד */
  const markSharedLocal = (listId: number, partnerIdentifier: string, status: 'pending' | 'active' = 'active') => {
    updateShareMeta(listId, { sharedWith: [partnerIdentifier], shareStatus: status, isShared: true });
  };

  /** עזרת אופטימיות: ניקוי שיתוף מקומי (למשל אחרי leave) */
  const clearShareLocal = (listId: number) => {
    updateShareMeta(listId, { sharedWith: [], isShared: false, shareStatus: undefined });
  };

  const orderedLists = useMemo(
    () => [...lists].sort((a, b) => a.order - b.order),
    [lists]
  );

  return {
    lists: orderedLists,
    setLists,
    selectedListId,
    setSelectedListId,
    currentList,
    addList,
    deleteList,
    renameList,
    addItem,
    deleteItem,
    toggleItem,
    clearCompleted,
    reorderLists,
    moveListBefore,

    // שיתוף
    replaceList,
    updateShareMeta,
    markSharedLocal,
    clearShareLocal,
  };
}
