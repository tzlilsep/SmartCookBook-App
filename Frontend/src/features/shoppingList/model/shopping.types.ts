// src/features/shoppingList/model/shopping.types.ts

export type ShareStatus = 'pending' | 'active';

export interface ShoppingItem {
  id: number;
  name: string;
  checked: boolean;
}

export interface ShoppingListData {
  id: number;
  name: string;
  items: ShoppingItem[];
  order: number;

  // --- שיתוף ---
  /** האם הרשימה משותפת בכלל (אליי או ממני) */
  isShared?: boolean;

  /** מזהה המשתמש/האימייל של השותף (לשמור תאימות כ-array, אך בפועל יש רק 0 או 1) */
  sharedWith?: string[];

  /** סטטוס השיתוף עבור המשתמש הנוכחי */
  shareStatus?: ShareStatus;

  /** האם המשתמש הנוכחי הוא הבעלים של הרשימה */
  isOwner?: boolean; // <<< נוסף — נדרש ל־UI כדי לדעת אם למחוק או רק לעזוב
}
