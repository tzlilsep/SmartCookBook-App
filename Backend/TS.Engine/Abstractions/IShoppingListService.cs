// MyApp\Backend\TS.Engine\Abstractions\IShoppingListService.cs
using TS.Engine.Contracts;

namespace TS.Engine.Abstractions
{
    public interface IShoppingListService
    {
        Task<IReadOnlyList<ShoppingListDto>> GetListsAsync(string userId, int take);

        Task CreateListAsync(string userId, string listId, string name, int? order = null);
        Task DeleteListAsync(string userId, string listId);

        Task<ShoppingListDto> LoadAsync(string userId, string listId);

        Task SaveAsync(ShoppingListDto list);

        // שיתוף רשימה (שותף יחיד; עם/בלי אישור)
        Task<ShoppingListDto> ShareAsync(string ownerUserId, string listId, string targetUserOrEmail, bool requireAccept);

        // <<< חדש: עזיבת רשימה משותפת (מסיר את השיתוף רק למשתמש הנוכחי)
        Task LeaveAsync(string userId, string listId);
    }

    public interface IShoppingListServiceFactory
    {
        IShoppingListService Create(string idToken);
    }
}
