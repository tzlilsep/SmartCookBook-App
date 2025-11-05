// MyApp\Backend\TS.Api\Features\ShoppingList\Contracts\ShoppingListDtos.cs
namespace TS.Api.Features.ShoppingList.Contracts
{
    public sealed class ShoppingListItemDto
    {
        public string Id { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public bool Checked { get; init; }
    }

    public sealed class ShoppingListDto
    {
        public string ListId { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public IReadOnlyList<ShoppingListItemDto> Items { get; init; } = Array.Empty<ShoppingListItemDto>();

        public int Order { get; init; }

        // --- שיתוף (תואם ל-Frontend) ---
        public bool? IsShared { get; init; }
        public IReadOnlyList<string>? SharedWith { get; init; }

        // חדש: נדרש ל-UI/Controller
        public string? ShareStatus { get; init; }   // "pending" | "active"
        public bool? IsOwner { get; init; }         // האם המשתמש הנוכחי הוא הבעלים
    }

    // GET /api/shopping/lists?take=20
    public sealed class GetListsResponseDto
    {
        public IReadOnlyList<ShoppingListDto> Lists { get; init; } = Array.Empty<ShoppingListDto>();
    }

    // POST /api/shopping/lists
    public sealed class CreateListRequestDto
    {
        public string ListId { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public int? Order { get; init; }   // אפשר לשלוח order התחלתי
    }

    public sealed class CreateListResponseDto
    {
        public bool Ok { get; init; }
        public ShoppingListDto? List { get; init; }
        public string? Error { get; init; }
    }

    // PUT /api/shopping/lists/{listId}
    public sealed class SaveListRequestDto
    {
        public ShoppingListDto List { get; init; } = new();
    }

    public sealed class SaveListResponseDto
    {
        public bool Ok { get; init; }
        public string? Error { get; init; }
    }

    // POST /api/shopping/lists/{listId}/share
    public sealed class ShareListRequestDto
    {
        public string Target { get; init; } = string.Empty; // אימייל/שם משתמש של הצד השני
        public bool? RequireAccept { get; init; }           // ברירת מחדל: false
    }

    public sealed class ShareListResponseDto
    {
        public bool Ok { get; init; }
        public ShoppingListDto? List { get; init; }
        public string? Error { get; init; }
    }

    // POST /api/shopping/lists/{listId}/leave
    public sealed class LeaveListResponseDto
    {
        public bool Ok { get; init; }
        public string ListId { get; init; } = string.Empty;
        public string? Error { get; init; }
    }
}
