import { Text, View } from "@/components/localized";
import { colors, radii, spacing } from "@smaj/design-tokens";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

type Order = { _id?: string; id?: string; productTitle?: string; productImage?: string; pricePi?: number; status?: string; paymentStatus?: string; createdAt?: string; buyerId?: string; sellerId?: string };

export default function NativeOrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try { const data = await api.request<{orders:Order[]}>("/marketplace/orders"); setOrders(data.orders || []); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Orders could not load."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { if (user) void load(); else setLoading(false); }, [load, user]);

  return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Orders</Text></View><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)}/>} contentContainerStyle={styles.content}>
    {!user ? <View style={styles.state}><Text style={styles.stateTitle}>Sign in to view orders</Text><Text style={styles.muted}>Use Continue with Pi from the You tab.</Text></View> : null}
    {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.primary}/><Text style={styles.muted}>Loading shared orders...</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!loading && user && !orders.length ? <View style={styles.state}><Text style={styles.stateTitle}>No orders yet</Text><Text style={styles.muted}>Orders created on Android or web will appear here.</Text></View> : null}
    {orders.map(order => <View key={order._id || order.id} style={styles.card}>{order.productImage ? <Image source={{uri:order.productImage}} style={styles.image}/> : <View style={styles.fallback}><Text>ST</Text></View>}<View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{order.productTitle || "SMAJ Store order"}</Text><Text style={styles.price}>π {Number(order.pricePi || 0).toFixed(4)}</Text><View style={styles.statusRow}><Text style={styles.status}>{order.status || "pending"}</Text><Text style={styles.payment}>{order.paymentStatus || "payment pending"}</Text></View></View></View>)}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},header:{height:66,paddingHorizontal:spacing.lg,flexDirection:"row",alignItems:"center",gap:spacing.md,backgroundColor:colors.surface},back:{fontSize:38,color:colors.primary},title:{fontSize:22,fontWeight:"900",color:colors.text},content:{padding:spacing.lg,paddingBottom:80,gap:spacing.md},state:{minHeight:220,alignItems:"center",justifyContent:"center",gap:spacing.sm},stateTitle:{fontSize:19,fontWeight:"900",color:colors.text},muted:{color:colors.textMuted,textAlign:"center"},error:{padding:spacing.lg,color:colors.danger,backgroundColor:"#FFF1F1",borderRadius:radii.md},card:{padding:spacing.md,flexDirection:"row",gap:spacing.md,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},image:{width:84,height:84,borderRadius:radii.sm},fallback:{width:84,height:84,alignItems:"center",justifyContent:"center",borderRadius:radii.sm,backgroundColor:colors.surfaceMuted},copy:{flex:1,gap:spacing.xs},name:{fontSize:15,fontWeight:"900",color:colors.text},price:{fontSize:16,fontWeight:"900",color:colors.primary},statusRow:{flexDirection:"row",flexWrap:"wrap",gap:spacing.sm},status:{paddingHorizontal:8,paddingVertical:4,borderRadius:radii.pill,overflow:"hidden",fontSize:10,fontWeight:"800",color:colors.success,backgroundColor:"#DFF7EC"},payment:{paddingHorizontal:8,paddingVertical:4,borderRadius:radii.pill,overflow:"hidden",fontSize:10,fontWeight:"800",color:colors.warning,backgroundColor:"#FFF0CE"}});