import { Text, TextInput, View } from "@/components/localized";
import { colors, radii, spacing } from "@smaj/design-tokens";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { MobileProduct } from "@/types/marketplace";
import { productId, productTitle } from "@/types/marketplace";

const categories = ["All", "Deals", "Grocery", "Electronics", "Mobiles", "Laptops", "Fashion", "Beauty", "Home", "Vehicles", "Accessories"];

export default function NativeStoreScreen() {
  const [products, setProducts] = useState<MobileProduct[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const search = query.trim();
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category !== "All") params.set("category", category);
      const data = await api.request<{ products: MobileProduct[] }>(`/marketplace/products?${params.toString()}`);
      setProducts(data.products || []);
      setError("");
    } catch (cause) {
      setProducts([]);
      setError(cause instanceof Error ? cause.message : "The Store catalog could not load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => products.filter(product => {
    const needle = query.trim().toLowerCase();
    return !needle || [product.title, product.name, product.description, product.category, product.sellerName].join(" ").toLowerCase().includes(needle);
  }), [products, query]);

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
      <View style={styles.heading}><Text style={styles.kicker}>SMAJ PI HUB</Text><Text style={styles.title}>Store</Text></View>
      <Pressable style={styles.orders} onPress={() => router.push("/store/orders")}><Text style={styles.ordersText}>Orders</Text></Pressable>
    </View>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><Text style={styles.heroKicker}>PI COMMERCE</Text><Text style={styles.heroTitle}>Discover products from SMAJ sellers.</Text><Text style={styles.heroText}>The same live catalog, account, saved items and orders as SMAJ PI HUB web.</Text></View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search products, sellers, categories..." placeholderTextColor={colors.textMuted} style={styles.search} returnKeyType="search" onSubmitEditing={() => void load()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {categories.map(item => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></Pressable>)}
      </ScrollView>
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.primary}/><Text style={styles.muted}>Loading live catalog...</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {!loading && !error && !visible.length ? <View style={styles.state}><Text style={styles.stateTitle}>No products found</Text><Text style={styles.muted}>Try another search or category.</Text></View> : null}
      <View style={styles.grid}>
        {visible.map(product => {
          const id = productId(product);
          return <Pressable key={id} style={styles.card} disabled={!id} onPress={() => router.push({ pathname: "/store/product/[id]", params: { id } })}>
            <View style={styles.imageBox}>{product.image ? <Image source={{ uri: product.image }} style={styles.image} resizeMode="cover"/> : <Text style={styles.imageFallback}>ST</Text>}</View>
            <Text numberOfLines={2} style={styles.cardTitle}>{productTitle(product)}</Text>
            <Text original numberOfLines={1} style={styles.seller}>{product.sellerName || product.piUsername || "SMAJ seller"}</Text>
            <Text style={styles.price}>π {Number(product.pricePi || 0).toFixed(4)}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},header:{minHeight:72,paddingHorizontal:spacing.lg,flexDirection:"row",alignItems:"center",gap:spacing.md,backgroundColor:colors.surface,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},back:{fontSize:38,color:colors.primary},heading:{flex:1},kicker:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:colors.primary},title:{fontSize:24,fontWeight:"900",color:colors.text},orders:{paddingHorizontal:14,paddingVertical:9,borderRadius:radii.pill,backgroundColor:colors.surfaceMuted},ordersText:{fontWeight:"800",color:colors.primaryDark},
  content:{padding:spacing.lg,paddingBottom:80,gap:spacing.lg},hero:{padding:spacing.xl,borderRadius:radii.lg,backgroundColor:colors.primary,gap:spacing.sm},heroKicker:{color:"#F5D87A",fontSize:10,fontWeight:"900",letterSpacing:1.2},heroTitle:{color:"#FFF",fontSize:24,lineHeight:29,fontWeight:"900"},heroText:{color:"#EEE8FF",fontSize:13,lineHeight:20},search:{height:52,paddingHorizontal:spacing.lg,borderWidth:1,borderColor:colors.border,borderRadius:radii.md,backgroundColor:colors.surface,color:colors.text},categories:{gap:spacing.sm},chip:{paddingHorizontal:14,paddingVertical:9,borderRadius:radii.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{fontSize:12,fontWeight:"700",color:colors.textMuted},chipTextActive:{color:"#FFF"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:spacing.md},card:{width:"47.8%",padding:spacing.sm,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,gap:spacing.xs},imageBox:{height:130,borderRadius:radii.sm,overflow:"hidden",alignItems:"center",justifyContent:"center",backgroundColor:colors.surfaceMuted},image:{width:"100%",height:"100%"},imageFallback:{fontSize:32,fontWeight:"900",color:colors.primary},cardTitle:{minHeight:38,fontSize:14,lineHeight:19,fontWeight:"800",color:colors.text},seller:{fontSize:11,color:colors.textMuted},price:{fontSize:16,fontWeight:"900",color:colors.primaryDark},state:{minHeight:180,alignItems:"center",justifyContent:"center",gap:spacing.md},stateTitle:{fontSize:18,fontWeight:"900",color:colors.text},muted:{color:colors.textMuted,textAlign:"center"},error:{padding:spacing.lg,gap:spacing.sm,borderRadius:radii.md,backgroundColor:"#FFF1F1"},errorText:{color:colors.danger},retry:{fontWeight:"900",color:colors.primary}
});