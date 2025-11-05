// src/features/auth/model/auth.context.tsx
import React, { createContext, useContext, useMemo, useState, ReactNode, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthInfo = {
  token?: string | null;
  userId?: string | null;
  userName?: string | null;
};

type AuthContextValue = {
  auth: AuthInfo;
  sessionId: number;                 // מזהה סשן נוכחי (נגד מרוצי תגובות ישנות)
  setAuth: (info: AuthInfo) => Promise<void>;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = '@auth';
const DATA_PREFIXES = ['@auth', '@lists:', '@cache:', '@offline:', '@ds:', 'shopping/'];

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function wipeByPrefixes(prefixes: string[]) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k => prefixes.some(p => k.startsWith(p)));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthInfo>({ token: null, userId: null, userName: null });
  const [sessionId, setSessionId] = useState<number>(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mountedRef.current) setAuthState(JSON.parse(raw));
      } catch {}
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const setAuth = async (info: AuthInfo) => {
    setAuthState(info);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch {}
  };

  const signOut = async () => {
    // ביטול סשן ישן + ניקוי קאש
    setSessionId(Date.now());
    setAuthState({ token: null, userId: null, userName: null });
    await wipeByPrefixes(DATA_PREFIXES);
  };

  const value = useMemo(() => ({ auth, sessionId, setAuth, signOut }), [auth, sessionId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
