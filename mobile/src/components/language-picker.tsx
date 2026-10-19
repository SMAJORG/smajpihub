import { Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { languages } from '../../../frontend/src/localization/languages';
import { selectLanguage } from '@/lib/i18n';
import { Text, View } from './localized';
export function LanguagePicker() {
  const { i18n } = useTranslation();
  return <View accessibilityLabel="Language" style={{ paddingVertical: 12 }}>
    <Text style={{ fontWeight: '700', marginBottom: 8 }}>Language</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator>
      {languages.map(language => <Pressable key={language.code} accessibilityRole="button" accessibilityState={{ selected: i18n.language === language.code }} onPress={() => void selectLanguage(language.code)} style={{ padding: 10, marginEnd: 6, borderRadius: 10, backgroundColor: i18n.language === language.code ? '#e9ddff' : '#f2f2f2' }}><Text original>{language.label}</Text></Pressable>)}
    </ScrollView>
  </View>;
}
