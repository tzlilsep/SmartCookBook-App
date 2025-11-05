// src/features/auth/model/useLoginForm.ts
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { authService } from '../api/auth.service';
import { useAuth } from './auth.context';

export function useLoginForm(onSuccess: (username: string) => void) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = () => setIsRegister(!isRegister);
  const { setAuth, signOut, sessionId } = useAuth();

  const lastRunRef = useRef<number>(0);

  const handleSubmit = async () => {
    if (isRegister && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (!username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    // נקה סשן/קאש ישן לפני התחברות חדשה
    await signOut();

    const runId = Date.now();
    lastRunRef.current = runId;
    const sessionAtStart = sessionId;

    const result = isRegister
      ? await authService.register(username, password)
      : await authService.login(username, password);

    setLoading(false);

    // הגנה ממרוצי רשת: מתעלמים מתשובה "ישנה"
    if (lastRunRef.current !== runId || sessionId !== sessionAtStart) return;

    if (!result.ok) {
      Alert.alert('Error', result.error || 'Authentication failed');
      return;
    }

    await setAuth({
      token: result.token ?? null,
      userId: result.user?.id ?? null,
      userName: result.user?.name ?? null,
    });

    onSuccess(username);
  };

  return {
    isRegister,
    username,
    password,
    confirmPassword,
    loading,
    setUsername,
    setPassword,
    setConfirmPassword,
    toggleMode,
    handleSubmit,
  };
}
