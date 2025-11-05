// MyApp\Frontend\src\features\shoppingList\api\shopping.api.types.ts

export interface ShoppingItemDto {
  id: string;
  name: string;
  checked: boolean;
}

export type ShareStatusDto = 'pending' | 'active';

export interface ShoppingListDto {
  listId: string;
  name: string;
  items: ShoppingItemDto[];
  order: number;              // נשמר ומוחזר מהשרת

  // --- שיתוף ---
  /** האם הרשימה משותפת למשתמש הנוכחי עם צד נוסף (השרת יגביל לשותף יחיד) */
  isShared?: boolean;
  /** הצדדים המשויכים לרשימה. לשמירה על תאימות נשאר מערך, אך בפועל השרת יגביל ל-0..1 */
  sharedWith?: string[];
  /** סטטוס השיתוף של המשתמש הנוכחי מול הרשימה */
  shareStatus?: ShareStatusDto;

  /** האם המשתמש הנוכחי הוא הבעלים של הרשימה */
  isOwner?: boolean;          // <<< חדש: מאפשר ל-UI להבדיל בין Delete ל-Leave
}

/** GET /api/shopping/lists?take=... */
export interface GetListsResponseDto {
  lists: ShoppingListDto[];
}

/** POST /api/shopping/lists */
export interface CreateListRequestDto {
  listId: string;
  name: string;
  order?: number;
}
export interface CreateListResponseDto {
  ok: boolean;
  list?: ShoppingListDto;
  error?: string;
}

/** GET /api/shopping/lists/{listId} */
export type LoadListResponseDto = ShoppingListDto;

/** PUT /api/shopping/lists/{listId} */
export interface SaveListRequestDto {
  list: ShoppingListDto;     // כולל order
}
export interface SaveListResponseDto {
  ok: boolean;
  error?: string;
}

/** --- 🔗 שיתוף רשימה (שותף יחיד) --- */
/** POST /api/shopping/lists/{listId}/share */
export interface ShareListRequestDto {
  target: string;              // אימייל/שם משתמש
  requireAccept?: boolean;     // האם נדרש אישור של הצד השני (ברירת מחדל: true)
}
export interface ShareListResponseDto {
  ok: boolean;
  list?: ShoppingListDto;      // הרשימה המעודכנת אחרי השיתוף
  error?: string;              // למשל: "ALREADY_SHARED"
}

/** --- 🚪 עזיבת רשימה משותפת (לא מחיקה מלאה) --- */
/** POST /api/shopping/lists/{listId}/leave */
export interface LeaveListResponseDto {
  ok: boolean;
  listId: string;              // הרשימה ממנה המשתמש עזב
  error?: string;
}
