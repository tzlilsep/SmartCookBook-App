// MyApp\Backend\TS.AWS\Factories\AwsClientsFactory.cs
using Amazon;
using Amazon.CognitoIdentity;
using Amazon.CognitoIdentityProvider;            // <<< חדש
using Amazon.DynamoDBv2;
using Amazon.Runtime;
using TS.AWS.Auth;

namespace TS.AWS.Factories
{
    // Builds AWS clients using Cognito Identity Pool + User Pool IdToken.
    public static class AwsClientsFactory
    {
        public static IAmazonDynamoDB CreateDynamoDbFromIdToken(string idToken)
        {
            var region = RegionEndpoint.GetBySystemName(AwsAuthConfig.Region);
            var creds = new CognitoAWSCredentials(AwsAuthConfig.IdentityPoolId, region);
            creds.AddLogin(AwsAuthConfig.LoginProvider, idToken);
            return new AmazonDynamoDBClient(creds, region);
        }

        // <<< חדש: קליינט Cognito IDP עם אותן הרשאות (Identity Pool + IdToken)
        public static IAmazonCognitoIdentityProvider CreateCognitoIdpFromIdToken(string idToken)
        {
            var region = RegionEndpoint.GetBySystemName(AwsAuthConfig.Region);
            var creds = new CognitoAWSCredentials(AwsAuthConfig.IdentityPoolId, region);
            creds.AddLogin(AwsAuthConfig.LoginProvider, idToken);
            return new AmazonCognitoIdentityProviderClient(creds, region);
        }
    }
}
