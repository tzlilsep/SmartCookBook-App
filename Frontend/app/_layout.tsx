// app/_layout.tsx

import { Stack } from 'expo-router';                                    // Handles screen navigation using a stack structure
import { SafeAreaProvider } from 'react-native-safe-area-context';      // Ensures content respects device safe areas
import { StatusBar } from 'expo-status-bar';                            // Controls status bar appearance across platforms
import { AuthProvider } from '../src/features/auth/model/auth.context'; // ??????????

// Root layout - wraps the entire app, applies global providers, defines root navigation stack
export default function RootLayout() {
  return (
    // Wraps the app to adjust layout based on safe areas
    <SafeAreaProvider>
      {/* Provides authentication context to all screens */}
      <AuthProvider>
        {/* Main navigation stack for all routes under /app */}
        <Stack
          screenOptions={{
            headerShown: false,                               // Hides default header
            contentStyle: { backgroundColor: '#EEF2FF' },   // Sets a consistent background color for all screens
            gestureEnabled: false,                            // Disables swipe-back gestures globally
          }}
        />
        {/* Defines global status bar style and background */}
        <StatusBar style="dark" backgroundColor="#EEF2FF" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
