// Frontend\src\features\shoppingList\api\shopping.service.ts
import {
  ShoppingListDto,
  ShoppingItemDto,
  GetListsResponseDto,
  CreateListRequestDto,
  CreateListResponseDto,
  LoadListResponseDto,
  SaveListRequestDto,
  SaveListResponseDto,
  // לשלב השיתוף:
  ShareListRequestDto,
  ShareListResponseDto,
  // חדש: לעזיבה (לא מחיקה מלאה)
  LeaveListResponseDto,
} from './shopping.api.types';
import { ShoppingListData, ShoppingItem } from '../model/shopping.types';

/** DTO <-> Model */
function toItem(i: ShoppingItemDto): ShoppingItem {
  return { id: Number(i.id), name: i.name, checked: i.checked };
}
function toDtoItem(i: ShoppingItem): ShoppingItemDto {
  return { id: String(i.id), name: i.name, checked: i.checked };
}

function toList(dto: ShoppingListDto): ShoppingListData {
  return {
    id: Number(dto.listId),
    name: dto.name,
    items: dto.items.map(toItem),
    order: dto.order,
    isShared: dto.isShared,
    sharedWith: dto.sharedWith,
    // shareStatus לא ממופה כרגע לצד המודל (נשמור את ה-UI פשוט)
    isOwner: (dto as any).isOwner, // ✅ חדש: מאפשר החלטה על Delete/Leave
  };
}
function toDtoList(list: ShoppingListData): ShoppingListDto {
  return {
    listId: String(list.id),
    name: list.name,
    items: list.items.map(toDtoItem),
    order: list.order,
    isShared: list.isShared,
    sharedWith: list.sharedWith,
    // לא משדרים shareStatus מהמודל
    // מעבירים isOwner רק אם השרת מצפה לזה (לרוב לא נדרש ב-PUT)
    ...(list as any).isOwner != null ? { isOwner: (list as any).isOwner } : {},
  } as ShoppingListDto;
}

const API_BASE_URL = 'http://192.168.1.51:5005/api';

async function http<T>(
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...rest,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const contentLength = res.headers.get('content-length');
  if (res.status === 204 || contentLength === '0') {
    // @ts-expect-error – no body
    return undefined;
  }
  return (await res.json()) as T;
}

export const shoppingService = {
  async getLists(token: string, take = 20): Promise<ShoppingListData[]> {
    const data = await http<GetListsResponseDto>(`/shopping/lists?take=${take}`, {
      method: 'GET',
      token,
    });
    return data.lists.map(toList).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  async createList(
    token: string,
    name: string,
    id: number = Date.now(),
    order?: number
  ): Promise<ShoppingListData> {
    const body: CreateListRequestDto = { listId: String(id), name, ...(order != null ? { order } : {}) };
    const data = await http<CreateListResponseDto>('/shopping/lists', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
    if (!data.ok || !data.list) throw new Error(data.error || 'Create list failed');
    return toList(data.list);
  },

  async deleteList(token: string, listId: number): Promise<void> {
    await http<void>(`/shopping/lists/${listId}`, {
      method: 'DELETE',
      token,
    });
  },

  /** חדש: עזיבת רשימה משותפת (לא מוחק לכל הצדדים) */
  async leaveList(token: string, listId: number): Promise<void> {
    const data = await http<LeaveListResponseDto>(`/shopping/lists/${listId}/leave`, {
      method: 'POST',
      token,
    });
    if (!data.ok) throw new Error(data.error || 'Leave list failed');
  },

  async loadList(token: string, listId: number): Promise<ShoppingListData> {
    const data = await http<LoadListResponseDto>(`/shopping/lists/${listId}`, {
      method: 'GET',
      token,
    });
    return toList(data);
  },

  async saveList(token: string, list: ShoppingListData): Promise<void> {
    const req: SaveListRequestDto = { list: toDtoList(list) };
    const data = await http<SaveListResponseDto>(`/shopping/lists/${list.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(req),
    });
    if (!data.ok) throw new Error(data.error || 'Save list failed');
  },

  async saveMany(token: string, lists: ShoppingListData[]): Promise<void> {
    await Promise.all(lists.map(l => shoppingService.saveList(token, l)));
  },

  /** 🔗 SHARE: POST /api/shopping/lists/{listId}/share */
  async shareList(
    token: string,
    listId: number,
    target: string,
    requireAccept: boolean = false // לשמירה על פשטות: ברירת מחדל שיתוף מיידי
  ): Promise<ShoppingListData> {
    const body: ShareListRequestDto = { target, requireAccept };
    const data = await http<ShareListResponseDto>(`/shopping/lists/${listId}/share`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
    if (!data.ok || !data.list) throw new Error(data.error || 'Share list failed');
    return toList(data.list);
  },
};
