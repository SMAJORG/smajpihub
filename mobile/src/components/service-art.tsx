import { View } from "@/components/localized";
import {Image,StyleSheet} from "react-native";
const atlas=require("@/assets/images/web/smaj-service-atlas.png");
export function ServiceArt({index,size=62}:{index:number;size?:number}){const column=index%5,row=Math.floor(index/5);return <View style={[s.crop,{width:size,height:size,borderRadius:size*.24}]}><Image source={atlas} resizeMode="stretch" style={{position:"absolute",width:size*5,height:size*3,left:-column*size,top:-row*size}}/></View>}
const s=StyleSheet.create({crop:{overflow:"hidden",backgroundColor:"#F3F0FF"}});
