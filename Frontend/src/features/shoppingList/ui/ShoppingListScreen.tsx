// Frontend/src/features/shoppingList/ui/ShoppingListScreen.tsx
import React, { useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShoppingListData } from '../model/shopping.types';
import { useShoppingLists } from '../model/useShoppingLists';
import { ShoppingListsScreen } from './screens/ShoppingListsScreen';
import { ShoppingListDetailsScreen } from './screens/ShoppingListDetailsScreen';
import { useAuth } from '../../auth/model/auth.context';
import { shoppingService } from '../api/shopping.service';
import { Alert } from 'react-native';

type Props = {
  onBack: () => void;
  initialLists?: ShoppingListData[];
};

const CACHE_KEY = 'shopping/lists:v1';
const userCacheKey = (userId?: string | null) => `${CACHE_KEY}:${userId ?? 'anon'}`;

export function ShoppingListScreen({ onBack, initialLists = [] }: Props) {
  const { auth } = useAuth();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top && insets.top > 0 ? insets.top : 44;

  const {
    lists,
    setLists,
    selectedListId,
    setSelectedListId,
    currentList,
    addList,
    // deleteList, // לא משתמשים כדי לא לשנות order
    renameList,
    addItem,
    deleteItem,
    toggleItem,
    clearCompleted,
  } = useShoppingLists(
    initialLists,
    async (listsToPersist) => {
      const key = userCacheKey(auth?.userId);

      if (!auth?.token) {
        try {
          const sorted = sortByOrder(listsToPersist as any);
          await AsyncStorage.setItem(key, JSON.stringify(sorted));
        } catch {}
        return;
      }

      try {
        await shoppingService.saveMany(auth.token, listsToPersist);
        const sorted = sortByOrder(listsToPersist as any);
        await AsyncStorage.setItem(key, JSON.stringify(sorted));
      } catch (e) {
        console.warn('Failed to persist lists to server:', e);
      }
    }
  );

  /** Utility: always return a list sorted by `order` (fallback to index). */
  const sortByOrder = (arr: ShoppingListData[]) =>
    [...arr].sort((a: any, b: any) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });

  /** Create list */
  const handleCreateList = async (name: string) => {
    const key = userCacheKey(auth?.userId);
    const finalName = name?.trim() || 'רשימה חדשה';

    const appendWithOrder = (base: ShoppingListData[], newList: ShoppingListData) => {
      const nextOrder =
        base.length === 0 ? 0 : Math.max(...base.map(l => (l as any).order ?? -1)) + 1;
      const withOrder = { ...(newList as any), order: nextOrder } as any;
      const next = sortByOrder([...base, withOrder]);
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    };

    if (!auth.token) {
      // Local only – ודא שאנחנו הבעלים מקומית
      setLists(prev =>
        appendWithOrder(prev, { id: Date.now(), name: finalName, items: [], isOwner: true, isShared: false, sharedWith: [] } as any)
      );
      return;
    }

    try {
      const current = lists;
      const nextOrder =
        current.length === 0 ? 0 : Math.max(...current.map(l => (l as any).order ?? -1)) + 1;
      const created = await shoppingService.createList(auth.token, finalName, Date.now(), nextOrder);

      setLists(prev => {
        const next = sortByOrder([...prev, created]);
        AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      console.warn('Create list failed, falling back to local:', e);
      setLists(prev =>
        appendWithOrder(prev, { id: Date.now(), name: finalName, items: [], isOwner: true, isShared: false, sharedWith: [] } as any)
      );
    }
  };

  /** ✅ Delete vs Leave (smart) */
  const handleDeleteList = async (id: number) => {
    const key = userCacheKey(auth?.userId);
    const list = lists.find(l => l.id === id);

    // אופטימי: הסרה מקומית ושמירת קאש
    setLists(prev => {
      const next = prev.filter(l => l.id !== id);
      const sorted = sortByOrder(next);
      AsyncStorage.setItem(key, JSON.stringify(sorted)).catch(() => {});
      return sorted;
    });
    if (selectedListId === id) setSelectedListId(null);

    if (auth.token) {
      try {
        if (list?.isShared && !list?.isOwner) {
          // לא בעלים ברשימה משותפת → עזיבה בלבד
          await shoppingService.leaveList(auth.token, id);
        } else {
          // בעלים או לא משותפת → מחיקה מלאה
          await shoppingService.deleteList(auth.token, id);
        }
      } catch (e) {
        console.warn('Failed to delete/leave on server:', e);
      }
    }
  };

  /** עזיבה מפורשת (משמש כשמסך הפנימי יקרא onLeaveList ישירות) */
  const handleLeaveList = async (id: number) => {
    const key = userCacheKey(auth?.userId);

    // אופטימי: מסיר מקומית
    setLists(prev => {
      const next = prev.filter(l => l.id !== id);
      const sorted = sortByOrder(next);
      AsyncStorage.setItem(key, JSON.stringify(sorted)).catch(() => {});
      return sorted;
    });
    if (selectedListId === id) setSelectedListId(null);

    if (auth.token) {
      try {
        await shoppingService.leaveList(auth.token, id);
      } catch (e) {
        console.warn('Failed to leave on server:', e);
      }
    }
  };

  /** Reorder */
  const handleReorder = async (nextLists: ShoppingListData[]) => {
    const key = userCacheKey(auth?.userId);
    const normalized = nextLists.map((l, idx) => ({ ...(l as any), order: idx })) as any[];
    const sorted = sortByOrder(normalized);

    setLists(sorted);
    AsyncStorage.setItem(key, JSON.stringify(sorted)).catch(() => {});

    if (auth.token) {
      try {
        await shoppingService.saveMany(auth.token, sorted);
      } catch (e) {
        console.warn('Failed to persist reorder to server:', e);
      }
    }
  };

  /** Share (no approval) */
  const handleShareList = async (id: number, identifier: string) => {
    const key = userCacheKey(auth?.userId);

    if (!auth?.token) {
      Alert.alert('שיתוף רשימה', 'לא ניתן לשתף ללא התחברות.');
      return;
    }
    if (identifier?.trim() && identifier.trim() === auth.userId) {
      Alert.alert('שיתוף רשימה', 'אי אפשר לשתף רשימה עם עצמך.');
      return;
    }

    try {
      const updated = await shoppingService.shareList(auth.token, id, identifier.trim(), false);
      setLists(prev => {
        const next = prev.map(l => (l.id === updated.id ? updated : l));
        const sorted = sortByOrder(next);
        AsyncStorage.setItem(key, JSON.stringify(sorted)).catch(() => {});
        return sorted;
      });
      Alert.alert('שיתוף רשימה', 'השיתוף בוצע בהצלחה.');
    } catch (e: any) {
      const msg = (e?.message || '').trim() || 'שגיאה בשיתוף הרשימה.';
      Alert.alert('שיתוף נכשל', msg);
    }
  };

  /** 1) Hydration from local cache */
  useEffect(() => {
    let isMounted = true;
    const key = userCacheKey(auth?.userId);
    setLists([]);

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!isMounted) return;
        if (raw) {
          const cached: ShoppingListData[] = JSON.parse(raw);
          if (Array.isArray(cached)) {
            setLists(sortByOrder(cached as any));
          }
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [auth.userId, setLists]);

  /** 2) Remote fetch when authenticated */
  useEffect(() => {
    let isMounted = true;
    const key = userCacheKey(auth?.userId);

    (async () => {
      if (!auth.token) return;
      try {
        const remote = await shoppingService.getLists(auth.token, 20);
        if (!isMounted) return;
        const sorted = sortByOrder(remote);
        setLists(sorted);
        AsyncStorage.setItem(key, JSON.stringify(sorted)).catch(() => {});
      } catch (e) {
        console.warn('Failed loading shopping lists:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [auth.token, auth.userId, setLists]);

  // Details branch
  if (selectedListId !== null && currentList) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ShoppingListDetailsScreen
          safeTop={safeTop}
          list={currentList}
          onBack={() => setSelectedListId(null)}
          onRename={async (name) => {
            renameList(currentList.id, name);
            if (auth.token) {
              try {
                await shoppingService.saveList(auth.token, { ...currentList, name });
              } catch (e) {
                console.warn('שמירת שם רשימה נכשלה:', e);
              }
            }
          }}
          onAddItem={(name) => addItem(currentList.id, name)}
          onToggleItem={(itemId) => toggleItem(currentList.id, itemId)}
          onDeleteItem={(itemId) => deleteItem(currentList.id, itemId)}
          onClearCompleted={() => clearCompleted(currentList.id)}
        />
      </SafeAreaView>
    );
  }

  // Lists branch
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
      <ShoppingListsScreen
        safeTop={safeTop}
        lists={lists}
        onBack={onBack}
        onCreateList={handleCreateList}
        onOpenList={(id) => setSelectedListId(id)}
        onDeleteList={handleDeleteList}
        onLeaveList={handleLeaveList}        
        onReorder={handleReorder}
        onShareList={handleShareList}
      />
    </SafeAreaView>
  );
}
