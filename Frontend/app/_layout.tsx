// app/_layout.tsx
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#EEF2FF' } }} />
      {/* iOS לא טרנסלוסנטי, אבל נגדיר בכל זאת סטייל וצבע רקע תואם */}
      <StatusBar style="dark" backgroundColor="#EEF2FF" />
    </SafeAreaProvider>
  );
}
