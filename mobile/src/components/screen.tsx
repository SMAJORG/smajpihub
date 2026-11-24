import { Text, View } from "@/components/localized";
import { colors, spacing } from "@smaj/design-tokens";
import type { PropsWithChildren, ReactNode } from "react";
import { Image, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const logo = require("@/assets/images/web/logo.png");

export function PrivateChrome({ accountBar = false }: { accountBar?: boolean }) {
  if (!accountBar) return null;

  return (
    <View style={styles.privateBar}>
      <Image source={logo} resizeMode="contain" style={styles.logo} />
      <View style={styles.beta}>
        <Text style={styles.betaText}>BETA</Text>
      </View>
      <View style={styles.space} />
      <Text style={styles.control}>♧</Text>
      <Text style={styles.control}>◐</Text>
    </View>
  );
}

export function Screen({
  children,
  title,
  eyebrow,
  action,
  accountBar = false,
  hideHeading = false,
}: PropsWithChildren<{
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  accountBar?: boolean;
  hideHeading?: boolean;
}>) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <PrivateChrome accountBar={accountBar} />
      {!hideHeading && title ? (
        <View style={styles.heading}>
          <View style={styles.headingText}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {action}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  privateBar: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  logo: { width: 34, height: 34 },
  beta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  betaText: { fontSize: 9, fontWeight: "900", color: colors.text },
  space: { flex: 1 },
  control: { fontSize: 25, color: colors.text },
  heading: {
    paddingHorizontal: spacing.lg,
    paddingTop: 22,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  headingText: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2, color: colors.primary },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
});
