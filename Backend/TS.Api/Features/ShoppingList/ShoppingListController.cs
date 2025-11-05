// Backend\TS.Api\Features\ShoppingList\ShoppingListController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TS.Api.Features.ShoppingList.Contracts;
using TS.Api.Infrastructure;
using TS.Engine.Abstractions;
using EngineListDto = TS.Engine.Contracts.ShoppingListDto;
using EngineItemDto = TS.Engine.Contracts.ShoppingListItemDto;

namespace TS.Api.Features.ShoppingList
{
    [ApiController]
    [Route("api/shopping")]
    [Authorize]
    public sealed class ShoppingListController : ControllerBase
    {
        private readonly IShoppingListServiceFactory _factory;

        public ShoppingListController(IShoppingListServiceFactory factory)
        {
            _factory = factory;
        }

        private string? GetUserId() =>
            User.FindFirstValue("sub") ??
            User.FindFirstValue(ClaimTypes.NameIdentifier) ??
            User.FindFirstValue("cognito:username");

        // Engine -> API
        private static ShoppingListItemDto Map(EngineItemDto i) => new()
        {
            Id = i.Id,
            Name = i.Name,
            Checked = i.Checked
        };

        private static ShoppingListDto Map(EngineListDto l) => new()
        {
            ListId = l.ListId,
            Name   = l.Name,
            Items  = l.Items.Select(Map).ToArray(),
            Order  = l.Order,   // נשמר ומוחזר מהשרת

            // --- שיתוף ---
            IsShared    = l.IsShared,
            SharedWith  = l.SharedWith,
            ShareStatus = l.ShareStatus,   // <<< חדש
            IsOwner     = l.IsOwner        // <<< חדש
        };

        // API -> Engine
        private static EngineItemDto Map(ShoppingListItemDto i) => new()
        {
            Id = i.Id,
            Name = i.Name,
            Checked = i.Checked
        };

        private static EngineListDto Map(string userId, ShoppingListDto l) => new()
        {
            UserId = userId,
            ListId = l.ListId,
            Name   = l.Name,
            Items  = l.Items.Select(Map).ToArray(),
            Order  = l.Order,    // נשמר

            // --- שיתוף ---
            IsShared    = l.IsShared,
            SharedWith  = l.SharedWith,
            ShareStatus = l.ShareStatus,   // <<< חדש (אופציונלי)
            IsOwner     = l.IsOwner        // <<< חדש (לרוב ה-Engine יקבע, אבל שומר תאימות)
        };

        /// GET /api/shopping/lists?take=20
        [HttpGet("lists")]
        public async Task<IActionResult> GetLists([FromQuery] int take = 20)
        {
            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            var svc = _factory.Create(idToken);
            var lists = await svc.GetListsAsync(userId!, take);

            var payload = new GetListsResponseDto
            {
                Lists = lists
                    .OrderBy(l => l.Order)
                    .Select(Map)
                    .ToArray()
            };
            return Ok(payload);
        }

        /// GET /api/shopping/lists/{listId}
        [HttpGet("lists/{listId}")]
        public async Task<IActionResult> Load(string listId)
        {
            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            var svc = _factory.Create(idToken);
            var list = await svc.LoadAsync(userId!, listId);

            return Ok(Map(list));
        }

        /// POST /api/shopping/lists
        [HttpPost("lists")]
        public async Task<IActionResult> Create([FromBody] CreateListRequestDto? body)
        {
            if (body is null || string.IsNullOrWhiteSpace(body.Name) || string.IsNullOrWhiteSpace(body.ListId))
                return BadRequest("Invalid request");

            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            var svc = _factory.Create(idToken);

            await svc.CreateListAsync(userId!, body.ListId, body.Name, body.Order);

            var created = await svc.LoadAsync(userId!, body.ListId);

            return Ok(new CreateListResponseDto
            {
                Ok = true,
                List = Map(created)
            });
        }

        /// PUT /api/shopping/lists/{listId}
        [HttpPut("lists/{listId}")]
        public async Task<IActionResult> Save(string listId, [FromBody] SaveListRequestDto? body)
        {
            if (body is null || body.List is null || string.IsNullOrWhiteSpace(body.List.ListId))
                return BadRequest("Invalid request body.");

            if (!string.Equals(listId, body.List.ListId, StringComparison.Ordinal))
                return BadRequest("Route listId does not match body.");

            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            var engineList = Map(userId!, body.List);

            var svc = _factory.Create(idToken);
            await svc.SaveAsync(engineList);

            return Ok(new SaveListResponseDto { Ok = true });
        }

        /// DELETE /api/shopping/lists/{listId}
        [HttpDelete("lists/{listId}")]
        public async Task<IActionResult> Delete(string listId)
        {
            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            var svc = _factory.Create(idToken);
            await svc.DeleteListAsync(userId!, listId);

            return NoContent();
        }

        /// POST /api/shopping/lists/{listId}/share
        [HttpPost("lists/{listId}/share")]
        public async Task<IActionResult> Share(string listId, [FromBody] ShareListRequestDto? body)
        {
            if (string.IsNullOrWhiteSpace(listId) || body is null || string.IsNullOrWhiteSpace(body.Target))
                return BadRequest(new ShareListResponseDto { Ok = false, Error = "Invalid request" });

            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized(new ShareListResponseDto { Ok = false, Error = "Missing bearer token." });

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized(new ShareListResponseDto { Ok = false, Error = "Missing user identity." });

            var requireAccept = body.RequireAccept ?? false;

            try
            {
                var svc = _factory.Create(idToken);
                var updated = await svc.ShareAsync(userId!, listId, body.Target, requireAccept);

                return Ok(new ShareListResponseDto
                {
                    Ok = true,
                    List = Map(updated)
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ShareListResponseDto { Ok = false, Error = ex.Message });
            }
            catch
            {
                return StatusCode(500, new ShareListResponseDto { Ok = false, Error = "Failed to share the list." });
            }
        }

        /// POST /api/shopping/lists/{listId}/leave
        [HttpPost("lists/{listId}/leave")]
        public async Task<IActionResult> Leave(string listId)
        {
            var idToken = BearerTokenReader.Read(Request);
            if (string.IsNullOrWhiteSpace(idToken))
                return Unauthorized("Missing bearer token.");

            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized("Missing user identity.");

            try
            {
                var svc = _factory.Create(idToken);
                await svc.LeaveAsync(userId!, listId);

                return Ok(new LeaveListResponseDto
                {
                    Ok = true,
                    ListId = listId
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new LeaveListResponseDto { Ok = false, ListId = listId, Error = ex.Message });
            }
            catch
            {
                return StatusCode(500, new LeaveListResponseDto { Ok = false, ListId = listId, Error = "Failed to leave the list." });
            }
        }
    }
}
