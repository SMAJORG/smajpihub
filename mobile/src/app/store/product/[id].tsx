import { Alert, Text, View } from "@/components/localized";
import { colors, radii, spacing } from "@smaj/design-tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import type { ProductDetailResponse } from "@/types/marketplace";
import { productTitle } from "@/types/marketplace";

export default function NativeProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<ProductDetailResponse | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.request<ProductDetailResponse>(`/marketplace/products/${id}`).then(result => {
      setData(result);
      setSelectedImage(result.product.images?.[0] || result.product.image || "");
      setError("");
    }).catch(cause => setError(cause instanceof Error ? cause.message : "Product not found.")).finally(() => setLoading(false));
  }, [id]);

  const favorite = async () => {
    if (!user) return Alert.alert("Sign in required", "Continue with Pi from the You tab first.");
    setSubmitting(true);
    try {
      const result = await api.request<{ saved: boolean }>(`/marketplace/products/${id}/favorite`, { method: "POST", body: "{}" });
      setData(current => current ? { ...current, saved: result.saved } : current);
    } catch (cause) {
      Alert.alert("Could not save product", cause instanceof Error ? cause.message : "Please try again.");
    } finally { setSubmitting(false); }
  };

  const order = async () => {
    if (!user) return Alert.alert("Sign in required", "Continue with Pi from the You tab first.");
    setSubmitting(true);
    try {
      const result = await api.request<{ order: { _id?: string; id?: string } }>("/marketplace/orders", { method: "POST", body: JSON.stringify({ productId: id }) });
      Alert.alert("Order created", "Your order is ready. Complete its Pi payment from the order screen.", [{ text: "View orders", onPress: () => router.push("/store/orders") }]);
      void result;
    } catch (cause) {
      Alert.alert("Order could not be created", cause instanceof Error ? cause.message : "Please try again.");
    } finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color={colors.primary}/><Text>Loading product...</Text></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.center}><Text style={styles.error}>{error || "Product not found."}</Text><Pressable onPress={() => router.back()}><Text style={styles.link}>Go back</Text></Pressable></SafeAreaView>;
  const product = data.product;
  const images = product.images?.length ? product.images : [product.image].filter((value): value is string => Boolean(value));

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.headerTitle}>Product details</Text><Pressable disabled={submitting} onPress={() => void favorite()}><Text style={styles.save}>{data.saved ? "Saved" : "Save"}</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.imageBox}>{selectedImage ? <Image source={{ uri: selectedImage }} style={styles.image} resizeMode="contain"/> : <Text style={styles.imageFallback}>ST</Text>}</View>
      {images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>{images.map(image => <Pressable key={image} onPress={() => setSelectedImage(image)} style={[styles.thumb, selectedImage === image && styles.thumbActive]}><Image source={{ uri: image }} style={styles.thumbImage}/></Pressable>)}</ScrollView> : null}
      <View style={styles.copy}><Text original style={styles.category}>{product.category || "SMAJ Store"}</Text><Text style={styles.title}>{productTitle(product)}</Text><Text style={styles.price}>π {Number(product.pricePi || 0).toFixed(4)}</Text><Text style={styles.location}>{[product.city, product.country, product.location].filter(Boolean).join(" · ")}</Text><Text original style={styles.description}>{product.description || "Contact the seller for product information."}</Text></View>
      <View style={styles.seller}><View style={styles.avatar}>{data.seller?.avatar ? <Image source={{ uri: data.seller.avatar }} style={styles.avatarImage}/> : <Text style={styles.avatarText}>{(data.seller?.displayName || product.sellerName || "S").slice(0,1)}</Text>}</View><View style={styles.sellerCopy}><Text style={styles.sellerLabel}>SELLER</Text><Text style={styles.sellerName}>{data.seller?.displayName || product.sellerName || "SMAJ seller"}</Text><Text style={styles.sellerHandle}>@{data.seller?.piUsername || product.piUsername || "pi-seller"}</Text></View></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={submitting} onPress={() => void order()} style={[styles.buy, submitting && styles.disabled]}><Text style={styles.buyText}>{submitting ? "Working..." : "Create order with Pi"}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:"center",justifyContent:"center",gap:spacing.md,backgroundColor:colors.background},header:{height:66,paddingHorizontal:spacing.lg,flexDirection:"row",alignItems:"center",gap:spacing.md,backgroundColor:colors.surface,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},back:{fontSize:38,color:colors.primary},headerTitle:{flex:1,fontSize:18,fontWeight:"900",color:colors.text},save:{fontWeight:"900",color:colors.primary},
  content:{padding:spacing.lg,paddingBottom:80,gap:spacing.lg},imageBox:{height:330,alignItems:"center",justifyContent:"center",overflow:"hidden",borderRadius:radii.lg,backgroundColor:colors.surface},image:{width:"100%",height:"100%"},imageFallback:{fontSize:54,fontWeight:"900",color:colors.primary},thumbs:{gap:spacing.sm},thumb:{width:64,height:64,padding:3,borderRadius:radii.sm,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},thumbActive:{borderWidth:2,borderColor:colors.primary},thumbImage:{width:"100%",height:"100%",borderRadius:7},copy:{gap:spacing.sm},category:{fontSize:11,fontWeight:"900",letterSpacing:1,color:colors.primary},title:{fontSize:28,lineHeight:34,fontWeight:"900",color:colors.text},price:{fontSize:25,fontWeight:"900",color:colors.primaryDark},location:{fontSize:12,color:colors.textMuted},description:{fontSize:15,lineHeight:23,color:colors.textMuted},
  seller:{padding:spacing.lg,flexDirection:"row",alignItems:"center",gap:spacing.md,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},avatar:{width:52,height:52,borderRadius:26,alignItems:"center",justifyContent:"center",overflow:"hidden",backgroundColor:colors.surfaceMuted},avatarImage:{width:"100%",height:"100%"},avatarText:{fontSize:20,fontWeight:"900",color:colors.primary},sellerCopy:{flex:1},sellerLabel:{fontSize:9,fontWeight:"900",color:colors.primary},sellerName:{fontSize:16,fontWeight:"900",color:colors.text},sellerHandle:{fontSize:12,color:colors.textMuted},buy:{minHeight:54,alignItems:"center",justifyContent:"center",borderRadius:radii.pill,backgroundColor:colors.primary},buyText:{color:"#FFF",fontSize:16,fontWeight:"900"},disabled:{opacity:.6},error:{color:colors.danger,textAlign:"center"},link:{fontWeight:"900",color:colors.primary}
});