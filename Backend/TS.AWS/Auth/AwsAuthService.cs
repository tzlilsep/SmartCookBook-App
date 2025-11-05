// Backend\TS.AWS\Auth\AwsAuthService.cs
using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Amazon.Runtime;
using TS.Engine.Abstractions;

namespace TS.AWS.Auth
{
    // IAuthService implementation backed by Amazon Cognito (USER_PASSWORD_AUTH).
    public sealed class AwsAuthService : IAuthService
    {
        private readonly IAmazonCognitoIdentityProvider _cognito;
        private readonly string _clientId;

        public AwsAuthService()
        {
            _clientId = AwsAuthConfig.ClientId;
            _cognito = new AmazonCognitoIdentityProviderClient(
                new AnonymousAWSCredentials(),
                RegionEndpoint.GetBySystemName(AwsAuthConfig.Region));
        }

        public async Task<(bool Ok, string? UserId, string? IdToken, string? Error)>
            SignInAsync(string username, string password)
        {
            try
            {
                var req = new InitiateAuthRequest
                {
                    ClientId = _clientId,
                    AuthFlow = AuthFlowType.USER_PASSWORD_AUTH,
                    AuthParameters = new()
                    {
                        ["USERNAME"] = username,
                        ["PASSWORD"] = password
                    }
                };

                var resp = await _cognito.InitiateAuthAsync(req);
                var idToken = resp.AuthenticationResult?.IdToken;
                if (string.IsNullOrWhiteSpace(idToken))
                    return (false, null, null, "Missing id_token.");

                var userId = GetJwtClaim(idToken, "sub");
                if (string.IsNullOrWhiteSpace(userId))
                    return (false, null, null, "UserId (sub) not found in token.");

                return (true, userId, idToken, null);
            }
            catch (NotAuthorizedException)
            {
                return (false, null, null, "Invalid username or password.");
            }
            catch (UserNotConfirmedException)
            {
                return (false, null, null, "User not confirmed.");
            }
            catch (Exception ex)
            {
                return (false, null, null, ex.Message);
            }
        }

        public Task SignOutAsync() => Task.CompletedTask;

        public Task<string?> GetUserIdAsync() => Task.FromResult<string?>(null);

        // Extract a claim value from a JWT payload (no signature validation here).
        private static string GetJwtClaim(string jwt, string claim)
        {
            var parts = jwt.Split('.');
            if (parts.Length < 2) return string.Empty;

            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');

            var json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(payload));
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty(claim, out var v) ? v.GetString() ?? "" : "";
        }
    }
}
