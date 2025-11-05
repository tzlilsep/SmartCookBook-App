// MyApp\Backend\TS.AWS\Services\AwsShoppingListService.cs 
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using TS.AWS.Factories;
using TS.Engine.Abstractions;
using TS.Engine.Contracts;
using Amazon.CognitoIdentityProvider;                 // <<< חדש
using TS.AWS.Auth;                                    // <<< חדש


namespace TS.AWS.Services;

public sealed class AwsShoppingListService : IShoppingListService
{
    private readonly IAmazonDynamoDB _ddb;
        private readonly IAmazonCognitoIdentityProvider _cognito;   // <<< חדש
    private readonly string _userPoolId;                        // <<< חדש
    private const string TableName = "AppData";

    public AwsShoppingListService(string idToken)
    {
        _ddb = AwsClientsFactory.CreateDynamoDbFromIdToken(idToken);
        _cognito = AwsClientsFactory.CreateCognitoIdpFromIdToken(idToken); // <<< חדש
        _userPoolId = AwsAuthConfig.UserPoolId;      
    }

  // Returns list headers with up to 'take' items
public async Task<IReadOnlyList<ShoppingListDto>> GetListsAsync(string userId, int take)
{
    // 1) Fetch all headers for this user (List OR SharedLink)
    var headersResp = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{userId}"),
            [":sk"] = new AttributeValue("LIST#")
        },
        // נוסיף שדות שיתוף/הפניה כדי לתמוך גם בלינקים משותפים
        ProjectionExpression = "PK, SK, #T, ListName, ListOrder, IsShared, SharedWith, RefUserId, RefListId",
        ExpressionAttributeNames = new()
        {
            ["#T"] = "Type"
        }
    });

    // נייצר רשימות גם מרשימות רגילות וגם מקישורי שיתוף
    var headers = new List<HeaderRow>();
    foreach (var i in headersResp.Items)
    {
        if (!i.TryGetValue("Type", out var t) || string.IsNullOrWhiteSpace(t.S)) continue;

        if (t.S == "List")
        {
            var listId = i["SK"].S.Replace("LIST#", string.Empty);
            var name   = i.TryGetValue("ListName", out var n) ? n.S : "רשימה";
            var order  = i.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N)
                            ? int.Parse(o.N)
                            : int.MaxValue;

            headers.Add(new HeaderRow
            {
                Kind = HeaderKind.List,
                UserId = userId,
                ListId = listId,
                Name   = name,
                Order  = order,
                IsShared = i.TryGetValue("IsShared", out var isSh) && (isSh.BOOL ?? false),
                SharedWith = i.TryGetValue("SharedWith", out var ss) && ss.SS != null ? ss.SS : new List<string>()
            });
        }
        else if (t.S == "SharedLink")
        {
            // לינק אצל המקבל לרשימה של משתמש אחר
            var name   = i.TryGetValue("ListName", out var n) ? n.S : "רשימה";
            var order  = i.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N)
                            ? int.Parse(o.N)
                            : int.MaxValue;
            var refUserId = i.TryGetValue("RefUserId", out var ru) ? ru.S : null;
            var refListId = i.TryGetValue("RefListId", out var rl) ? rl.S : null;
            if (string.IsNullOrWhiteSpace(refUserId) || string.IsNullOrWhiteSpace(refListId)) continue;

            headers.Add(new HeaderRow
            {
                Kind = HeaderKind.SharedLink,
                UserId = userId,       // המשתמש הנוכחי (המקבל)
                OwnerUserId = refUserId,
                ListId = refListId,    // מזהה הרשימה המקורי
                Name   = name,
                Order  = order,
                IsShared = true
            });
        }
    }

    headers = headers.OrderBy(h => h.Order).ToList();

    // 2) For each header, fetch up to 'take' items
    var results = new List<ShoppingListDto>(headers.Count);
    foreach (var h in headers)
    {
        var items = new List<ShoppingListItemDto>();

        if (take > 0)
        {
            if (h.Kind == HeaderKind.List)
            {
                // פריטים מתוך החשבון של המשתמש הנוכחי
                var itemsResp = await _ddb.QueryAsync(new QueryRequest
                {
                    TableName = TableName,
                    KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues = new()
                    {
                        [":pk"] = new AttributeValue($"USER#{h.UserId}"),
                        [":sk"] = new AttributeValue($"LIST#{h.ListId}#ITEM#")
                    },
                    ExpressionAttributeNames = new()
                    {
                        ["#T"] = "Text",
                        ["#C"] = "IsChecked"
                    },
                    ProjectionExpression = "SK, #T, #C",
                    Limit = take,
                    ScanIndexForward = true
                });

                foreach (var av in itemsResp.Items)
                {
                    var text = av.TryGetValue("Text", out var txt) ? txt.S : "";
                    var isChecked = av.TryGetValue("IsChecked", out var chk) && (chk.BOOL ?? false);
                    var sk = av.TryGetValue("SK", out var skVal) ? skVal.S : "";
                    var id = ExtractItemIdFromSk(sk);
                    if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(id))
                    {
                        items.Add(new ShoppingListItemDto { Id = id, Name = text, Checked = isChecked });
                    }
                }
            }
            else
            {
                // SharedLink: הפריטים נשמרים אצל הבעלים (OwnerUserId)
                var itemsResp = await _ddb.QueryAsync(new QueryRequest
                {
                    TableName = TableName,
                    KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues = new()
                    {
                        [":pk"] = new AttributeValue($"USER#{h.OwnerUserId}"),
                        [":sk"] = new AttributeValue($"LIST#{h.ListId}#ITEM#")
                    },
                    ExpressionAttributeNames = new()
                    {
                        ["#T"] = "Text",
                        ["#C"] = "IsChecked"
                    },
                    ProjectionExpression = "SK, #T, #C",
                    Limit = take,
                    ScanIndexForward = true
                });

                foreach (var av in itemsResp.Items)
                {
                    var text = av.TryGetValue("Text", out var txt) ? txt.S : "";
                    var isChecked = av.TryGetValue("IsChecked", out var chk) && (chk.BOOL ?? false);
                    var sk = av.TryGetValue("SK", out var skVal) ? skVal.S : "";
                    var id = ExtractItemIdFromSk(sk);
                    if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(id))
                    {
                        items.Add(new ShoppingListItemDto { Id = id, Name = text, Checked = isChecked });
                    }
                }
            }
        }

        // --- נרמול שותף יחיד (0..1)
        var normalizedSharedWith = (h.SharedWith != null && h.SharedWith.Count > 0)
            ? new List<string> { h.SharedWith[0] }
            : null;

        // Build row
        results.Add(new ShoppingListDto
        {
            UserId = h.UserId,
            ListId = h.ListId,
            Name   = h.Name,
            Items  = items,
            Order  = h.Order,

            IsShared   = h.IsShared ? true : (bool?)null,
            SharedWith = normalizedSharedWith,

            // חדשים: עוזרים ל-UI
            IsOwner     = (h.Kind == HeaderKind.List),
            ShareStatus = "active"
        });
    }

    return results.OrderBy(r => r.Order).ToList();
}


    // יצירה עם תמיכה ב-order (אם לא נשלח — להצמיד לסוף)
    public async Task CreateListAsync(string userId, string listId, string name, int? order = null)
    {
        var finalOrder = order ?? await ComputeNextOrder(userId);

        await _ddb.PutItemAsync(new PutItemRequest
        {
            TableName = TableName,
            Item = new()
            {
                ["PK"]        = new AttributeValue($"USER#{userId}"),
                ["SK"]        = new AttributeValue($"LIST#{listId}"),
                ["Type"]      = new AttributeValue("List"),
                ["ListName"]  = new AttributeValue(name),
                ["ListOrder"] = new AttributeValue { N = finalOrder.ToString() },
                ["UpdatedAt"] = new AttributeValue(DateTime.UtcNow.ToString("o"))
            },
            ConditionExpression = "attribute_not_exists(PK) AND attribute_not_exists(SK)"
        });
    }

    public async Task DeleteListAsync(string userId, string listId)
    {
        // Delete all rows under the list (header + items)
        var q = await _ddb.QueryAsync(new QueryRequest
        {
            TableName = TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new()
            {
                [":pk"] = new AttributeValue($"USER#{userId}"),
                [":sk"] = new AttributeValue($"LIST#{listId}")
            },
            ProjectionExpression = "PK, SK"
        });

        var batch = new List<WriteRequest>();
        foreach (var it in q.Items)
        {
            batch.Add(new WriteRequest(new DeleteRequest(new()
            {
                ["PK"] = it["PK"],
                ["SK"] = it["SK"]
            })));

            if (batch.Count == 25)
            {
                await _ddb.BatchWriteItemAsync(new BatchWriteItemRequest { RequestItems = new() { [TableName] = batch } });
                batch.Clear();
            }
        }
        if (batch.Count > 0)
            await _ddb.BatchWriteItemAsync(new BatchWriteItemRequest { RequestItems = new() { [TableName] = batch } });
    }

    // Loads a single list with all items (כולל Order מה-Header)
public async Task<ShoppingListDto> LoadAsync(string userId, string listId)
{
    // קודם נבדוק אם אצל המשתמש הזה זו רשימה רגילה או SharedLink
    var headerResp = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND SK = :sk",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{userId}"),
            [":sk"] = new AttributeValue($"LIST#{listId}")
        }
    });

    if (headerResp.Items.Count == 0)
    {
        // 1) ניסיון: זו ייתכן רשימה רגילה עם SK אחר – ננסה begins_with כללי
        headerResp = await _ddb.QueryAsync(new QueryRequest
        {
            TableName = TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new()
            {
                [":pk"] = new AttributeValue($"USER#{userId}"),
                [":sk"] = new AttributeValue("LIST#")
            },
            ProjectionExpression = "PK, SK, #T, RefUserId, RefListId, ListName, ListOrder",
            ExpressionAttributeNames = new() { ["#T"] = "Type" }
        });

        // 2) אם זו רשימת שיתוף – נמצא את זו שמפנה ל-listId המבוקש
        var linkCandidate = headerResp.Items
            .FirstOrDefault(av =>
                av.TryGetValue("Type", out var t) && t.S == "SharedLink" &&
                av.TryGetValue("RefListId", out var rl) && rl.S == listId);

        if (linkCandidate != null)
        {
            headerResp = new QueryResponse { Items = new List<Dictionary<string, AttributeValue>> { linkCandidate } };
        }
    }

    // ברירת מחדל: נניח רשימה רגילה
    string name = "רשימה";
    int order = int.MaxValue;
    var items = new List<ShoppingListItemDto>();
    bool isShared = false;
    List<string>? sharedWith = null;

    // האם זה SharedLink?
    var linkHeader = headerResp.Items.FirstOrDefault(av => av.TryGetValue("Type", out var t) && t.S == "SharedLink");
    if (linkHeader != null)
    {
        var refUserId = linkHeader.TryGetValue("RefUserId", out var ru) ? ru.S : null;
        var refListId = linkHeader.TryGetValue("RefListId", out var rl) ? rl.S : null;
        name  = linkHeader.TryGetValue("ListName", out var n) ? n.S : name;
        order = linkHeader.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N)
            ? int.Parse(o.N)
            : int.MaxValue;

        if (!string.IsNullOrWhiteSpace(refUserId) && !string.IsNullOrWhiteSpace(refListId))
        {
            // נביא header "אמיתי" מהבעלים כדי לרענן שם אם השתנה
            var ownerHeader = await _ddb.GetItemAsync(new GetItemRequest
            {
                TableName = TableName,
                Key = new()
                {
                    ["PK"] = new AttributeValue($"USER#{refUserId}"),
                    ["SK"] = new AttributeValue($"LIST#{refListId}")
                }
            });

            if (ownerHeader.Item != null && ownerHeader.Item.Count > 0)
            {
                name = ownerHeader.Item.TryGetValue("ListName", out var nn) ? nn.S : name;
            }

            // פריטים – תמיד מהבעלים
            var itemsResp = await _ddb.QueryAsync(new QueryRequest
            {
                TableName = TableName,
                KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues = new()
                {
                    [":pk"] = new AttributeValue($"USER#{refUserId}"),
                    [":sk"] = new AttributeValue($"LIST#{refListId}#ITEM#")
                },
                ExpressionAttributeNames = new()
                {
                    ["#T"] = "Text",
                    ["#C"] = "IsChecked"
                },
                ProjectionExpression = "SK, #T, #C",
                ScanIndexForward = true
            });

            foreach (var av in itemsResp.Items)
            {
                var text = av.TryGetValue("Text", out var txt) ? txt.S : "";
                var isChecked = av.TryGetValue("IsChecked", out var chk) && (chk.BOOL ?? false);
                var sk = av.TryGetValue("SK", out var skVal) ? skVal.S : "";
                var id = ExtractItemIdFromSk(sk);
                if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(id))
                {
                    items.Add(new ShoppingListItemDto { Id = id, Name = text, Checked = isChecked });
                }
            }

            // אצל המקבל: נסמן כמשותף (לא נציג SharedWith)
            return new ShoppingListDto
            {
                UserId = userId,
                ListId = listId,
                Name   = name,
                Items  = items,
                Order  = order,
                IsShared    = true,
                SharedWith  = null,
                IsOwner     = false,       // <<< חדש
                ShareStatus = "active"     // <<< חדש
            };
        }
    }

    // אחרת: נטעין רשימה רגילה אצל המשתמש עצמו
    var resp = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{userId}"),
            [":sk"] = new AttributeValue($"LIST#{listId}")
        }
    });

    foreach (var av in resp.Items)
    {
        if (!av.TryGetValue("Type", out var t)) continue;

        if (t.S == "List")
        {
            name  = av.TryGetValue("ListName", out var n) ? n.S : name;
            order = av.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N)
                ? int.Parse(o.N) : order;

            if (av.TryGetValue("IsShared", out var isSh) && (isSh.BOOL ?? false))
                isShared = true;
            if (av.TryGetValue("SharedWith", out var ss) && ss.SS != null && ss.SS.Count > 0)
                sharedWith = ss.SS.ToList();
        }
        else if (t.S == "ListItem")
        {
            var text = av.TryGetValue("Text", out var txt) ? txt.S : "";
            var isChecked = av.TryGetValue("IsChecked", out var chk) && (chk.BOOL ?? false);
            var sk = av.TryGetValue("SK", out var skVal) ? skVal.S : "";
            var id = ExtractItemIdFromSk(sk);

            if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(id))
            {
                items.Add(new ShoppingListItemDto { Id = id, Name = text, Checked = isChecked });
            }
        }
    }

    if (order == int.MaxValue)
        order = await ComputeNextOrder(userId);

    // נרמול SharedWith ל-0..1 (שותף יחיד)
    if (sharedWith != null && sharedWith.Count > 1)
        sharedWith = new List<string> { sharedWith[0] };

    return new ShoppingListDto
    {
        UserId = userId,
        ListId = listId,
        Name   = name,
        Items  = items,
        Order  = order,
        IsShared    = isShared ? true : (bool?)null,
        SharedWith  = sharedWith,
        IsOwner     = true,          // <<< חדש
        ShareStatus = "active"       // <<< חדש
    };
}


    public async Task SaveAsync(ShoppingListDto list)
{
    // אם הרשימה אצל המשתמש הזה היא SharedLink, ננתב את הכתיבה לבעלים
    var effectiveUserId = list.UserId;
    var effectiveListId = list.ListId;
    int? preserveOwnerOrder = null;

    // נאתר header כלשהו אצל המשתמש הנוכחי שמתחיל ב LIST#<listId> ועם Type=SharedLink
    var headerResp = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{list.UserId}"),
            [":sk"] = new AttributeValue($"LIST#{list.ListId}")
        }
    });

    var linkHeader = headerResp.Items.FirstOrDefault(av => av.TryGetValue("Type", out var t) && t.S == "SharedLink");
    if (linkHeader != null)
    {
        var refUserId = linkHeader.TryGetValue("RefUserId", out var ru) ? ru.S : null;
        var refListId = linkHeader.TryGetValue("RefListId", out var rl) ? rl.S : null;
        if (!string.IsNullOrWhiteSpace(refUserId) && !string.IsNullOrWhiteSpace(refListId))
        {
            effectiveUserId = refUserId;   // כותבים אצל הבעלים
            effectiveListId = refListId;

            // לא לדרוס Owner.Order עם order מקומי של המקבל — נשמר את הקיים
            var ownerHeader = await _ddb.GetItemAsync(new GetItemRequest
            {
                TableName = TableName,
                Key = new()
                {
                    ["PK"] = new AttributeValue($"USER#{effectiveUserId}"),
                    ["SK"] = new AttributeValue($"LIST#{effectiveListId}")
                },
                ProjectionExpression = "ListOrder"
            });
            if (ownerHeader.Item != null && ownerHeader.Item.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N))
            {
                preserveOwnerOrder = int.Parse(o.N);
            }
        }
    }

    // מכאן והלאה — עובדים על היעד האפקטיבי (Owner אם זה לינק)
    // Delete existing items
    var existing = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{effectiveUserId}"),
            [":sk"] = new AttributeValue($"LIST#{effectiveListId}#ITEM#")
        },
        ProjectionExpression = "PK, SK"
    });

    var deletes = existing.Items.Select(it =>
        new WriteRequest(new DeleteRequest(new()
        {
            ["PK"] = it["PK"],
            ["SK"] = it["SK"]
        }))).ToList();

    foreach (var chunk in Chunk(deletes, 25))
        await _ddb.BatchWriteItemAsync(new BatchWriteItemRequest { RequestItems = new() { [TableName] = chunk } });

    // Upsert list header (נעדכן שם ו-UpdatedAt; Order — נשמר אם עריכה דרך לינק)
    var finalOrder = preserveOwnerOrder ?? list.Order;
    await _ddb.PutItemAsync(new PutItemRequest
    {
        TableName = TableName,
        Item = new()
        {
            ["PK"]        = new AttributeValue($"USER#{effectiveUserId}"),
            ["SK"]        = new AttributeValue($"LIST#{effectiveListId}"),
            ["Type"]      = new AttributeValue("List"),
            ["ListName"]  = new AttributeValue(list.Name),
            ["ListOrder"] = new AttributeValue { N = finalOrder.ToString() },
            ["UpdatedAt"] = new AttributeValue(DateTime.UtcNow.ToString("o"))
        }
    });

    // Insert items
    var puts = new List<WriteRequest>();
    for (int i = 0; i < list.Items.Count; i++)
    {
        var it = list.Items[i];
        if (string.IsNullOrWhiteSpace(it.Name)) continue;

        var itemSkSuffix = i.ToString("D4");
        puts.Add(new WriteRequest(new PutRequest(new()
        {
            ["PK"]        = new AttributeValue($"USER#{effectiveUserId}"),
            ["SK"]        = new AttributeValue($"LIST#{effectiveListId}#ITEM#{itemSkSuffix}"),
            ["Type"]      = new AttributeValue("ListItem"),
            ["Text"]      = new AttributeValue(it.Name),
            ["IsChecked"] = new AttributeValue { BOOL = it.Checked }
        })));

        if (puts.Count == 25)
        {
            await _ddb.BatchWriteItemAsync(new BatchWriteItemRequest { RequestItems = new() { [TableName] = puts } });
            puts.Clear();
        }
    }
    if (puts.Count > 0)
        await _ddb.BatchWriteItemAsync(new BatchWriteItemRequest { RequestItems = new() { [TableName] = puts } });
}

// שיתוף רשימה – מיידי ללא אישור, שותף יחיד, Idempotent
public async Task<ShoppingListDto> ShareAsync(
    string ownerUserId,
    string listId,
    string targetUserOrEmail,
    bool requireAccept // נשאר לעתיד; כרגע לא בשימוש
)
{
    // 1) Resolve ל-userId (sub) אמיתי
    var targetUserId = await ResolveUserIdByUsername(targetUserOrEmail);
    if (string.IsNullOrWhiteSpace(targetUserId))
        throw new InvalidOperationException("שם המשתמש לא נמצא.");
    if (string.Equals(targetUserId, ownerUserId, StringComparison.Ordinal))
        throw new InvalidOperationException("אי אפשר לשתף עם עצמך.");

    // 2) ודא שהרשימה קיימת וקבל מטא
    var ownerHeader = await _ddb.GetItemAsync(new GetItemRequest
    {
        TableName = TableName,
        Key = new()
        {
            ["PK"] = new AttributeValue($"USER#{ownerUserId}"),
            ["SK"] = new AttributeValue($"LIST#{listId}")
        },
        ProjectionExpression = "PK, SK, #T, ListName, SharedWith",
        ExpressionAttributeNames = new() { ["#T"] = "Type" }
    });

    if (ownerHeader.Item is null ||
        !ownerHeader.Item.TryGetValue("Type", out var t) || t.S != "List")
        throw new InvalidOperationException("הרשימה לא נמצאה אצל הבעלים.");

    var listName   = ownerHeader.Item.TryGetValue("ListName", out var ln) ? ln.S : "רשימה";
    var existingSW = ownerHeader.Item.TryGetValue("SharedWith", out var ss) ? ss.SS : null;

    // --- אכיפת שותף יחיד:
    // אם כבר משותפת למישהו אחר (שאינו היעד) → חסום.
    if (existingSW != null && existingSW.Count > 0 && !existingSW.Contains(targetUserId))
        throw new InvalidOperationException("הרשימה כבר משותפת.");

    // 3) צור SharedLink אצל המקבל (Idempotent)
    var targetOrder = await ComputeNextOrder(targetUserId);
    var linkSk = $"LIST#SHARED#{ownerUserId}#{listId}";
    try
    {
        await _ddb.PutItemAsync(new PutItemRequest
        {
            TableName = TableName,
            Item = new()
            {
                ["PK"]        = new AttributeValue($"USER#{targetUserId}"),
                ["SK"]        = new AttributeValue(linkSk),
                ["Type"]      = new AttributeValue("SharedLink"),
                ["RefUserId"] = new AttributeValue(ownerUserId),
                ["RefListId"] = new AttributeValue(listId),
                ["ListName"]  = new AttributeValue(listName),
                ["ListOrder"] = new AttributeValue { N = targetOrder.ToString() },
                ["UpdatedAt"] = new AttributeValue(DateTime.UtcNow.ToString("o"))
            },
            ConditionExpression = "attribute_not_exists(PK) AND attribute_not_exists(SK)"
        });
    }
    catch (Amazon.DynamoDBv2.Model.ConditionalCheckFailedException)
    {
        // כבר קיים לינק זהה – נמשיך כ-OK (Idempotent)
    }

    // 4) עדכון מטא אצל הבעלים: SET לסט יחיד (לא ADD)
    await _ddb.UpdateItemAsync(new UpdateItemRequest
    {
        TableName = TableName,
        Key = new()
        {
            ["PK"] = new AttributeValue($"USER#{ownerUserId}"),
            ["SK"] = new AttributeValue($"LIST#{listId}")
        },
        UpdateExpression = "SET IsShared = :true, SharedWith = :single, UpdatedAt = :ts",
        ExpressionAttributeValues = new()
        {
            [":true"]  = new AttributeValue { BOOL = true },
            [":single"] = new AttributeValue { SS = new List<string> { targetUserId } },
            [":ts"]    = new AttributeValue(DateTime.UtcNow.ToString("o"))
        }
    });

    // 5) נחזיר לבעלים את הרשימה המעודכנת
    return await LoadAsync(ownerUserId, listId);
}


    private static string ExtractItemIdFromSk(string sk)
    {
        // "LIST#<listId>#ITEM#0007" -> "0007"
        const string marker = "#ITEM#";
        var idx = sk.LastIndexOf(marker, StringComparison.Ordinal);
        return idx >= 0 && idx + marker.Length < sk.Length
            ? sk.Substring(idx + marker.Length)
            : string.Empty;
    }

    private static IEnumerable<List<T>> Chunk<T>(IEnumerable<T> src, int size)
    {
        var buf = new List<T>(size);
        foreach (var x in src)
        {
            buf.Add(x);
            if (buf.Count == size) { yield return buf; buf = new(size); }
        }
        if (buf.Count > 0) yield return buf;
    }

    // מחשב next order ע"י סריקת כל ה-headers ומציאת המקסימום
    private async Task<int> ComputeNextOrder(string userId)
    {
        var headersResp = await _ddb.QueryAsync(new QueryRequest
        {
            TableName = TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new()
            {
                [":pk"] = new AttributeValue($"USER#{userId}"),
                [":sk"] = new AttributeValue("LIST#")
            },
            ProjectionExpression = "SK, #T, ListOrder",
            ExpressionAttributeNames = new()
            {
                ["#T"] = "Type"
            }
        });

        int max = -1;
        foreach (var i in headersResp.Items.Where(i => i.TryGetValue("Type", out var t) && (t.S == "List" || t.S == "SharedLink")))
        {
            if (i.TryGetValue("ListOrder", out var o) && !string.IsNullOrWhiteSpace(o.N))
            {
                if (int.TryParse(o.N, out var v) && v > max) max = v;
            }
            else
            {
                max = Math.Max(max, 0);
            }
        }
        return max + 1;
    }

    // מבני עזר פנימיים
    private enum HeaderKind { List, SharedLink }

    private sealed class HeaderRow
    {
        public HeaderKind Kind { get; init; }
        public string UserId { get; init; } = "";
        public string? OwnerUserId { get; init; } // עבור SharedLink
        public string ListId { get; init; } = "";
        public string Name { get; init; } = "";
        public int Order { get; init; }

        public bool IsShared { get; init; }
        public IReadOnlyList<string>? SharedWith { get; init; }
    }


    // ממיר username או sub/email ל-userId (sub) אמיתי דרך Cognito
    private async Task<string?> ResolveUserIdByUsername(string usernameOrId)
    {
        if (string.IsNullOrWhiteSpace(usernameOrId))
            return null;

        var input = usernameOrId.Trim();

        // אם זה כבר sub (GUID) – נחזיר כמו שהוא
        if (Guid.TryParse(input, out _))
            return input;

        // 1) חיפוש לפי username (זה מה שמוצג במסך: "לידור")
        var byUsername = await _cognito.ListUsersAsync(new Amazon.CognitoIdentityProvider.Model.ListUsersRequest
        {
            UserPoolId = _userPoolId,
            Filter = $"username = \"{EscapeForFilter(input)}\"",
            Limit = 1
        });
        var u = byUsername.Users?.FirstOrDefault();
        var sub = u?.Attributes?.FirstOrDefault(a => a.Name == "sub")?.Value;
        if (!string.IsNullOrWhiteSpace(sub))
            return sub;

        // 2) אם הוקלד אימייל – ננסה גם לפי email (לא חובה, אבל שימושי)
        if (input.Contains("@"))
        {
            var byEmail = await _cognito.ListUsersAsync(new Amazon.CognitoIdentityProvider.Model.ListUsersRequest
            {
                UserPoolId = _userPoolId,
                Filter = $"email = \"{EscapeForFilter(input)}\"",
                Limit = 1
            });
            var ue = byEmail.Users?.FirstOrDefault();
            var sub2 = ue?.Attributes?.FirstOrDefault(a => a.Name == "sub")?.Value;
            if (!string.IsNullOrWhiteSpace(sub2))
                return sub2;
        }

        return null;

    }

public async Task LeaveAsync(string userId, string listId)
{
    // חפש את ה-SharedLink עבור רשימה זו אצל המשתמש
    var links = await _ddb.QueryAsync(new QueryRequest
    {
        TableName = TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new()
        {
            [":pk"] = new AttributeValue($"USER#{userId}"),
            [":sk"] = new AttributeValue("LIST#SHARED#")
        },
        ProjectionExpression = "PK, SK, RefUserId, RefListId"
    });

    var link = links.Items.FirstOrDefault(it =>
        it.TryGetValue("RefListId", out var rl) && rl.S == listId);

    if (link == null)
        throw new InvalidOperationException("לא נמצאה רשימת שיתוף לעזיבה.");

    var ownerUserId = link.TryGetValue("RefUserId", out var ru) ? ru.S : null;
    var sk          = link.TryGetValue("SK", out var skVal) ? skVal.S : null;

    if (string.IsNullOrWhiteSpace(ownerUserId) || string.IsNullOrWhiteSpace(sk))
        throw new InvalidOperationException("נתוני שיתוף חסרים.");

    // 1) מחיקת ה-Link אצל המשתמש הנוכחי
    await _ddb.DeleteItemAsync(new DeleteItemRequest
    {
        TableName = TableName,
        Key = new()
        {
            ["PK"] = new AttributeValue($"USER#{userId}"),
            ["SK"] = new AttributeValue(sk)
        }
    });

    // 2) הסרת המשתמש מ-SharedWith אצל הבעלים
    await _ddb.UpdateItemAsync(new UpdateItemRequest
    {
        TableName = TableName,
        Key = new()
        {
            ["PK"] = new AttributeValue($"USER#{ownerUserId}"),
            ["SK"] = new AttributeValue($"LIST#{listId}")
        },
        // מסיר מהסט + מעדכן זמן
        UpdateExpression = "DELETE SharedWith :uid SET UpdatedAt = :ts",
        ExpressionAttributeValues = new()
        {
            [":uid"] = new AttributeValue { SS = new List<string> { userId } },
            [":ts"]  = new AttributeValue(DateTime.UtcNow.ToString("o"))
        }
    });

    // 3) אם אין יותר שותפים – קבע IsShared=false
    var ownerHeader = await _ddb.GetItemAsync(new GetItemRequest
    {
        TableName = TableName,
        Key = new()
        {
            ["PK"] = new AttributeValue($"USER#{ownerUserId}"),
            ["SK"] = new AttributeValue($"LIST#{listId}")
        },
        ProjectionExpression = "SharedWith"
    });

    var noPartners = ownerHeader.Item == null ||
                     !ownerHeader.Item.TryGetValue("SharedWith", out var ss) ||
                     ss.SS == null || ss.SS.Count == 0;

    if (noPartners)
    {
        await _ddb.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = TableName,
            Key = new()
            {
                ["PK"] = new AttributeValue($"USER#{ownerUserId}"),
                ["SK"] = new AttributeValue($"LIST#{listId}")
            },
            UpdateExpression = "SET IsShared = :false, UpdatedAt = :ts REMOVE SharedWith",
            ExpressionAttributeValues = new()
            {
                [":false"] = new AttributeValue { BOOL = false },
                [":ts"]    = new AttributeValue(DateTime.UtcNow.ToString("o"))
            }
        });
    }
}



    // עזר קטן ל-Filter של Cognito
    private static string EscapeForFilter(string s) =>
        s.Replace("\\", "\\\\").Replace("\"", "\\\"");


}
