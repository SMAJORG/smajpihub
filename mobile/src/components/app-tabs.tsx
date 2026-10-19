import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@smaj/design-tokens";
import { useTranslation } from 'react-i18next';
import { localizeText } from '../../../frontend/src/localization/catalog';

const homeIcon = require("@/assets/images/tabIcons/home.png");
const servicesIcon = require("@/assets/images/tabIcons/services.png");
const searchIcon = require("@/assets/images/tabIcons/search.png");
const messagesIcon = require("@/assets/images/tabIcons/messages.png");
const youIcon = require("@/assets/images/tabIcons/you.png");
export default function AppTabs() {
  const { i18n } = useTranslation();
  const label = (text: string) => localizeText(text, i18n) as string;
  return <NativeTabs backgroundColor={colors.surface} indicatorColor={colors.surfaceMuted} labelStyle={{ selected: { color: colors.primary } }} tintColor={colors.primary}>
    <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>{label('Home')}</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon src={homeIcon} renderingMode="template" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="services"><NativeTabs.Trigger.Label>{label('Services')}</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon src={servicesIcon} renderingMode="template" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="search"><NativeTabs.Trigger.Label>{label('Search')}</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon src={searchIcon} renderingMode="template" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="messages"><NativeTabs.Trigger.Label>{label('Messages')}</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon src={messagesIcon} renderingMode="template" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="you"><NativeTabs.Trigger.Label>{label('You')}</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon src={youIcon} renderingMode="template" /></NativeTabs.Trigger>
  </NativeTabs>;
}
