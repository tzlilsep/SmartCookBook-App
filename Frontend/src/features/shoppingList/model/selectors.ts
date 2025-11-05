// Frontend\src\features\shoppingList\model\selectors.ts
import { ShoppingListData } from './shopping.types';

export const doneCount = (list: ShoppingListData) =>
  list.items.filter(i => i.checked).length;

export const hasCompleted = (list: ShoppingListData) =>
  list.items.some(i => i.checked);

export const previewItems = (list: ShoppingListData, n = 3) =>
  list.items.slice(0, n);
