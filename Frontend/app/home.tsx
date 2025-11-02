// app/home.tsx
import { router, useLocalSearchParams } from 'expo-router';
import { HomeScreen } from '../src/features/home';

export default function HomeRoute() {
  const params = useLocalSearchParams<{ username?: string }>();
  const username =
    typeof params.username === 'string' && params.username.length > 0
      ? params.username
      : 'אורח';

  return (
    <HomeScreen
      username={username}
      onNavigate={(page) => {
        if (page === 'recipes') router.push('/recipeBook');
        if (page === 'shopping') router.push('/shoppingList');
        // planty כרגע נעול, אין ניווט
      }}
      onLogout={() => router.replace('/login')}
    />
  );
}
