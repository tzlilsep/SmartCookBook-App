// Frontend\src\features\shoppingList\ui\screens\ShoppingListsScreen.tsx
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { ArrowLeft, Edit2, ShoppingBasket, Trash2, MoreVertical, Share2, Users } from 'lucide-react-native';
import { Button } from '../../../../components/ui/button';
import { ShoppingListData, ShoppingItem } from '../../model/shopping.types';
import { previewItems } from '../../model/selectors';
import { NewListForm } from '../components/NewListForm';

type Props = {
  safeTop: number;
  lists: ShoppingListData[];
  onBack: () => void;
  onCreateList: (name: string) => void;
  onOpenList: (id: number) => void;
  /** מחיקה מלאה (לבעלים) או מחיקה כשלא משותפת */
  onDeleteList: (id: number) => Promise<void>;
  /** יציאה מרשימה משותפת (מסיר עבורי בלבד) */
  onLeaveList?: (id: number) => Promise<void>;
  onReorder?: (nextLists: ShoppingListData[]) => void;
  /** שיתוף עם משתמש אחד (נחסם אם כבר משותפת) */
  onShareList?: (id: number, identifier: string) => void | Promise<void>;
};

export function ShoppingListsScreen({
  safeTop,
  lists,
  onBack,
  onCreateList,
  onOpenList,
  onDeleteList,
  onLeaveList,
  onReorder,
  onShareList,
}: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // --- תפריט 3 נקודות ---
  const [menuForId, setMenuForId] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const menuBtnRefs = useRef<Record<number, View | null>>({});

  // --- דיאלוג שיתוף ---
  const [shareForId, setShareForId] = useState<number | null>(null);
  const [shareIdentifier, setShareIdentifier] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const keyExtractor = useCallback(
    (item: ShoppingListData, index: number) =>
      Number.isFinite(item.id) ? String(item.id) : `list:${item.name}:${index}`,
    []
  );

  /** מחיקה חכמה: אם הרשימה משותפת והמשתמש לא בעלים → Leave; אחרת Delete */
  const handleDeleteSmart = useCallback(
    async (id: number) => {
      if (deletingId != null) return;
      try {
        setDeletingId(id);
        setMenuForId(null);
        const list = lists.find(l => l.id === id);
        const isShared = !!list?.isShared;
        const isOwner = !!(list as any)?.isOwner;
        if (isShared && !isOwner && onLeaveList) {
          await onLeaveList(id);
        } else {
          await onDeleteList(id);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, lists, onDeleteList, onLeaveList]
  );

  const openShareDialog = useCallback((id: number) => {
    const l = lists.find(x => x.id === id);
    // בלוק שיתוף אם כבר משותפת או אם לא בעלים
    if (l?.isShared || !(l as any)?.isOwner) return;
    setMenuForId(null);
    setShareForId(id);
    setShareIdentifier('');
    setShareError(null);
    setIsSharing(false);
  }, [lists]);

  const submitShare = useCallback(async () => {
    if (!shareForId) return;
    const v = (shareIdentifier || '').trim();
    if (!v) return;

    const list = lists.find(l => l.id === shareForId);
    // הגנה כפולה ב־UI
    if (!list || list.isShared || !(list as any)?.isOwner) {
      setShareError('לא ניתן לשתף: הרשימה כבר משותפת או שאינך הבעלים.');
      return;
    }

    try {
      setIsSharing(true);
      setShareError(null);
      const maybePromise = onShareList?.(shareForId, v);
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        await (maybePromise as Promise<void>);
      }
      setShareForId(null);
      setShareIdentifier('');
    } catch (e: any) {
      // רצוי שהשרת יחזיר שגיאה ייעודית כמו "ALREADY_SHARED"
      setShareError(typeof e?.message === 'string' ? e.message : 'שגיאה בעת שיתוף הרשימה');
    } finally {
      setIsSharing(false);
    }
  }, [onShareList, shareForId, shareIdentifier, lists]);

  /** תג "משותפת" — פשוט וללא שמות/מספרים */
  const SharedBadge = ({ item }: { item: ShoppingListData }) => {
    if (!item.isShared) return null;
    return (
      <View style={styles.sharedRow}>
        <Users size={14} color="#2563EB" />
        <Text style={styles.sharedText}>משותפת</Text>
      </View>
    );
  };

  // --- תפריט גלובלי במודל ---
  const OverflowMenu = ({
    visible,
    anchor,
    onClose,
    onSharePress,
    onDeletePress,
    isDeleting,
    canShare,
    deleteLabel,
  }: {
    visible: boolean;
    anchor: { x: number; y: number } | null;
    onClose: () => void;
    onSharePress: () => void;
    onDeletePress: () => void;
    isDeleting: boolean;
    canShare: boolean;
    deleteLabel: string;
  }) => {
    const W = Dimensions.get('window').width;
    const H = Dimensions.get('window').height;

    const MENU_WIDTH = 180;
    const MENU_HEIGHT = 110;
    const verticalOffset = 3;
    const horizontalOffset = 180;

    const calcTop = () => {
      if (!anchor) return (safeTop || 0) + 8;
      const desired = anchor.y + verticalOffset;
      const minTop = (safeTop || 0) + 8;
      const maxTop = H - MENU_HEIGHT - 8;
      return Math.min(maxTop, Math.max(minTop, desired));
    };

    const calcLeft = () => {
      if (!anchor) return 8;
      const desired = anchor.x - horizontalOffset;
      return Math.max(8, desired);
    };

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.menuModalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject as any} onPress={onClose} />
          {anchor && (
            <View style={[styles.menu, { top: calcTop(), left: calcLeft(), width: MENU_WIDTH }]}>
              <TouchableOpacity
                style={[styles.menuItem, !canShare && { opacity: 0.5 }]}
                onPress={canShare ? onSharePress : undefined}
                disabled={!canShare}
              >
                <Share2 size={16} style={{ marginLeft: 8 }} />
                <Text style={styles.menuText}>
                  {canShare ? 'שיתוף רשימה' : 'שיתוף זמין לבעלים בלבד'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={onDeletePress} disabled={isDeleting}>
                <Trash2 size={16} color={isDeleting ? '#9CA3AF' : '#ef4444'} style={{ marginLeft: 8 }} />
                <Text style={[styles.menuText, { color: isDeleting ? '#9CA3AF' : '#ef4444' }]}>
                  {isDeleting ? 'מבצע…' : deleteLabel}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ShoppingListData>) => {
      const isDeleting = deletingId === item.id;
      const isOwner: boolean = !!(item as any)?.isOwner;
      const canShare = isOwner && !item.isShared; // שיתוף רק לבעלים ורק אם עוד לא משותפת
      const deleteLabel = item.isShared && !isOwner ? 'הסר עבורי' : 'מחיקה';

      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onOpenList(item.id)}
          onLongPress={drag}
          style={[styles.card, isActive && { opacity: 0.9 }]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <ShoppingBasket size={20} />
              <Text style={[styles.title, { marginRight: 8 }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
          </View>

          {/* תג השיתוף – שורה מתחת לכותרת */}
          <SharedBadge item={item} />

          {/* תת־כותרת */}
          <Text style={[styles.subtitle, { marginTop: 6 }]}>
            {item.items.length === 0
              ? 'רשימה ריקה'
              : `${item.items.length} פריטים • ${item.items.filter(i => i.checked).length} הושלמו`}
          </Text>

          {item.items.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {previewItems(item, 3).map((sub: ShoppingItem, iidx: number) => (
                <Text
                  key={Number.isFinite(sub.id) ? String(sub.id) : `item:${sub.name}:${iidx}`}
                  style={[
                    styles.itemText,
                    { textAlign: 'right' },
                    sub.checked ? styles.itemChecked : undefined,
                    iidx > 0 && { marginTop: 4 },
                  ]}
                >
                  • {sub.name}
                </Text>
              ))}
              {item.items.length > 3 && (
                <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                  ועוד {item.items.length - 3} פריטים...
                </Text>
              )}
            </View>
          )}

          <View style={[styles.row, { marginTop: 12 }]}>
            <Button variant="outline" onPress={() => onOpenList(item.id)} style={{ flex: 1 }}>
              <Edit2 size={16} style={{ marginLeft: 8 }} />
              <Text>פתח</Text>
            </Button>

            {/* כפתור שלוש נקודות — עם ref למדידה יציבה */}
            <TouchableOpacity
              ref={(el) => { menuBtnRefs.current[item.id] = el as any; }}
              onPress={() => {
                const ref = menuBtnRefs.current[item.id];
                if (ref && typeof (ref as any).measureInWindow === 'function') {
                  (ref as any).measureInWindow((x: number, y: number, w: number, h: number) => {
                    setMenuAnchor({ x: x + w, y: y + h });
                    setMenuForId(item.id);
                  });
                } else {
                  setMenuAnchor(null);
                  setMenuForId(item.id);
                }
              }}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="אפשרויות נוספות"
            >
              <MoreVertical size={18} />
            </TouchableOpacity>
          </View>

          {/* תפריט עבור כרטיס זה */}
          {menuForId === item.id && (
            <OverflowMenu
              visible={menuForId != null}
              anchor={menuAnchor}
              onClose={() => setMenuForId(null)}
              onSharePress={() => {
                if (menuForId != null) openShareDialog(menuForId);
              }}
              onDeletePress={() => {
                if (menuForId != null) handleDeleteSmart(menuForId);
              }}
              isDeleting={isDeleting}
              canShare={canShare}
              deleteLabel={deleteLabel}
            />
          )}
        </TouchableOpacity>
      );
    },
    [onOpenList, deletingId, menuForId, menuAnchor, handleDeleteSmart, openShareDialog]
  );

  return (
    <View style={[styles.screen, { paddingTop: 10 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Button variant="outline" onPress={onBack}>
          <Text>חזור</Text>
          <ArrowLeft size={18} style={{ marginRight: 8 }} />
        </Button>

        <NewListForm onSubmit={onCreateList} />
      </View>

      {/* Empty state */}
      {lists.length === 0 ? (
        <View style={styles.card}>
          <View style={{ alignItems: 'center' }}>
            <ShoppingBasket size={48} color="#9CA3AF" />
            <Text style={{ color: '#6B7280', marginTop: 8 }}>עדיין אין רשימות קניות. צור את הרשימה הראשונה שלך!</Text>
          </View>
        </View>
      ) : (
        <DraggableFlatList
          data={lists}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 12 }}
          activationDistance={6}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          onDragEnd={({ data }: { data: ShoppingListData[] }) => {
            onReorder?.(data);
          }}
        />
      )}

      {/* דיאלוג שיתוף */}
      <Modal
        visible={shareForId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setShareForId(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>שיתוף רשימה</Text>
            <Text style={styles.modalSubtitle}>
              ניתן לשתף עם משתמש אחד בלבד, ורק על־ידי הבעלים.
            </Text>
            <TextInput
              value={shareIdentifier}
              onChangeText={(t) => {
                setShareIdentifier(t);
                if (shareError) setShareError(null);
              }}
              placeholder="username"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
              editable={!isSharing}
            />

            {shareError ? (
              <Text style={{ color: '#ef4444', marginTop: 6, textAlign: 'right' }}>
                {shareError}
              </Text>
            ) : null}

            <View style={[styles.row, { marginTop: 12 }]}>
              <Button variant="outline" onPress={() => setShareForId(null)} style={{ flex: 1 }} disabled={isSharing}>
                <Text>בטל</Text>
              </Button>
              <View style={{ width: 12 }} />
              <Button onPress={submitShare} style={{ flex: 1 }} disabled={!shareIdentifier.trim() || isSharing}>
                <Share2 size={16} style={{ marginLeft: 8 }} />
                <Text>{isSharing ? 'משתף…' : 'שתף'}</Text>
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEF2FF', paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280' },
  itemText: { flex: 1, fontSize: 16, color: '#111827' },
  itemChecked: { textDecorationLine: 'line-through', color: '#9CA3AF' },

  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginRight: 8,
  },

  menuModalOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  menuText: { fontSize: 14, color: '#111827' },

  /** תג שיתוף פשוט – יושב מתחת לכותרת */
  sharedRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
  },
  sharedText: { fontSize: 11, color: '#1D4ED8', marginRight: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'right' },
  modalSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    fontSize: 16,
    color: '#111827',
  },
});
