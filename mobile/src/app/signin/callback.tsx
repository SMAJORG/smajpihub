import { Text, View } from "@/components/localized";
import { colors, radii, spacing } from "@smaj/design-tokens";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/auth-provider";

export default function PiOAuthCallbackScreen() {
  const { user, signingIn, authError, beginPiSignIn } = useAuth();
  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user]);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.card}>
      {signingIn ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      <Text style={styles.title}>{authError ? "Sign-in needs attention" : "Finishing Pi sign-in"}</Text>
      <Text accessibilityRole={authError ? "alert" : undefined} style={[styles.message, authError && styles.error]}>{authError || "Verifying your Pi identity and restoring your SMAJ account..."}</Text>
      {authError ? <Pressable style={styles.button} onPress={() => void beginPiSignIn()}><Text style={styles.buttonText}>Try again</Text></Pressable> : null}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.xl, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  card: { width: "100%", padding: spacing.xl, alignItems: "center", gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 21, fontWeight: "900", textAlign: "center" },
  message: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  error: { color: colors.danger },
  button: { marginTop: spacing.sm, paddingHorizontal: 24, paddingVertical: 13, borderRadius: radii.pill, backgroundColor: colors.primary },
  buttonText: { color: "#FFFFFF", fontWeight: "900" }
});