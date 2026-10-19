import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/providers/auth-provider";
import { useEffect, useState } from 'react';
import { localeReady } from '@/lib/i18n';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => { void localeReady.then(() => setReady(true)); }, []);
  if (!ready) return null;
  return <AuthProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="service/[slug]" options={{ presentation: "card" }} />
      <Stack.Screen name="store/index" />
      <Stack.Screen name="store/product/[id]" />
      <Stack.Screen name="store/orders" />
      <Stack.Screen name="messages/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="signin/callback" options={{ presentation: "card" }} />
    </Stack>
  </AuthProvider>;
}
