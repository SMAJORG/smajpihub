import { Text } from "@/components/localized";
import { colors, radii } from "@smaj/design-tokens";
import type { ServiceLaunchStatus } from "@smaj/shared-types";
import { StyleSheet} from "react-native";
export function StatusPill({ status }: { status: ServiceLaunchStatus }) {
  const label = status === "live" ? "LIVE" : status === "coming-soon" ? "COMING SOON" : "IN PROGRESS";
  return <Text style={[styles.base, status === "live" ? styles.live : status === "coming-soon" ? styles.soon : styles.progress]}>{label}</Text>;
}
const styles = StyleSheet.create({
  base: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: radii.pill, overflow: "hidden", fontSize: 8, fontWeight: "900" },
  live: { color: "#FFFFFF", backgroundColor: colors.primary }, progress: { color: colors.primaryDark, backgroundColor: "#EFE9FF" }, soon: { color: colors.warning, backgroundColor: "#FFF0CE" }
});