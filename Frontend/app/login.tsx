// app/login.tsx
import { router } from 'expo-router';
import { LoginScreen } from '../src/features/auth';

export default function LoginRoute() {
  return (
    <LoginScreen
      onLogin={(u) =>
        router.replace({
          pathname: '/home',
          params: { username: u ?? '' },
        })
      }
    />
  );
}
