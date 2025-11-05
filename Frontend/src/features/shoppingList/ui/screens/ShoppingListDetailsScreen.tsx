//Frontend\src\features\shoppingList\ui\screens\ShoppingListDetailsScreen.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { ArrowLeft, Check, Edit2, ArrowDown } from 'lucide-react-native';
import { Button } from '../../../../components/ui/button';
import { ShoppingListData } from '../../model/shopping.types';
import { doneCount, hasCompleted } from '../../model/selectors';
import { ItemRow } from '../components/ItemRow';
import { NewItemRow } from '../components/NewItemRow';

type Props = {
  safeTop: number;
  list: ShoppingListData;
  onBack: () => void;
  onRename: (name: string) => void;
  onAddItem: (name: string) => void;
  onToggleItem: (itemId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onClearCompleted: () => void;
};

export function ShoppingListDetailsScreen({
  safeTop,
  list,
  onBack,
  onRename,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClearCompleted,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState(list.name);

  // ✅ פעולה חדשה — מעבירה את כל הפריטים שסומנו לסוף הרשימה
  const onMoveCompletedToEnd = (list: ShoppingListData) => {
    const reordered = [
      ...list.items.filter(i => !i.checked),
      ...list.items.filter(i => i.checked),
    ];
    list.items = reordered;
    onRename(list.name); // יפעיל שמירה דרך useShoppingLists
  };

  return (
    <View style={[styles.screen, { paddingTop: 10 }]}>
      <View style={styles.headerRow}>
        <Button variant="outline" onPress={onBack}>
          <Text>חזור לרשימות</Text>
          <ArrowLeft size={18} style={{ marginRight: 8 }} />
        </Button>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          {!isEditing ? (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{list.name}</Text>
              <Button
                variant="outline"
                onPress={() => {
                  setEdited(list.name);
                  setIsEditing(true);
                }}
                style={styles.editIconBtn}
              >
                <Edit2 size={20} />
              </Button>
            </View>
          ) : (
            <View style={styles.renameRow}>
              <TextInput
                value={edited}
                onChangeText={setEdited}
                placeholder="שם הרשימה"
                style={[styles.input, { flex: 1 }]}
                textAlign="right"
                autoFocus
                onSubmitEditing={() => {
                  onRename(edited);
                  setIsEditing(false);
                }}
              />
              <Button
                onPress={() => {
                  onRename(edited);
                  setIsEditing(false);
                }}
                style={{ marginLeft: 8 }}
              >
                <Text>שמור</Text>
              </Button>
              <Button variant="outline" onPress={() => setIsEditing(false)}>
                <Text>ביטול</Text>
              </Button>
            </View>
          )}

          <Text
            style={[
              styles.sharedNote,
              isEditing && { opacity: 0 }, // מסתיר את המונה בזמן עריכה
            ]}
          >
            {doneCount(list)} / {list.items.length}
          </Text>
        </View>

        <View style={styles.divider} />

        <NewItemRow onSubmit={onAddItem} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {list.items.length === 0 ? (
            <Text style={styles.empty}>
              רשימת הקניות ריקה. הוסף פריטים כדי להתחיל!
            </Text>
          ) : (
            list.items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                style={idx > 0 ? { marginTop: 0 } : undefined}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))
          )}

          {hasCompleted(list) && (
            <View style={{ marginTop: 6 }}>

              <Button variant="outline" onPress={() => onMoveCompletedToEnd(list)}>
                <ArrowDown size={16} style={styles.ml2} />
                <Text>הורד פריטים שסומנו לסוף</Text>
              </Button>
              

              <View style={{ height: 8 }} />
              <Button variant="outline" onPress={onClearCompleted}>
                <Check size={16} style={styles.ml2} />
                <Text>נקה פריטים שסומנו</Text>
              </Button>
              
            </View>
          )}
        </ScrollView>
      </View>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    flex: 1,
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
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minWidth: 120,
  },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  renameRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8 },
  sharedNote: { fontSize: 12, color: '#6B7280' },
  empty: { textAlign: 'center', color: '#6B7280', paddingVertical: 16 },
  ml2: { marginLeft: 8 },
  editIconBtn: {
    marginRight: 12,
    width: 15,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
});
