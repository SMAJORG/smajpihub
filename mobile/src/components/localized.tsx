import { Text as NativeText, TextInput as NativeInput, View as NativeView, Alert as NativeAlert, type TextProps, type TextInputProps, type ViewProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { localizeText } from '../../../frontend/src/localization/catalog';
import { localizeDisplay } from '../../../frontend/src/localization/numbers';
import i18n from '@/lib/i18n';

const childrenText = (value: ReactNode): ReactNode => Array.isArray(value) ? value.map(childrenText) : localizeDisplay(localizeText(value, i18n), i18n) as ReactNode;
export function Text({ original = false, children, style, ...props }: TextProps & { original?: boolean }) {
  useTranslation();
  return <NativeText {...props} style={[{ writingDirection: i18n.language === 'ar' ? 'rtl' : 'ltr' }, style]}>{original ? children : childrenText(children)}</NativeText>;
}
export function TextInput({ placeholder, style, ...props }: TextInputProps) {
  useTranslation();
  return <NativeInput {...props} placeholder={localizeText(placeholder, i18n) as string | undefined} style={[{ writingDirection: i18n.language === 'ar' ? 'rtl' : 'ltr' }, style]} />;
}
export function View({ style, accessibilityLabel, ...props }: ViewProps) {
  useTranslation();
  return <NativeView {...props} accessibilityLabel={localizeText(accessibilityLabel, i18n) as string | undefined} style={[{ direction: i18n.language === 'ar' ? 'rtl' : 'ltr' }, style]} />;
}
export const Alert = {
  ...NativeAlert,
  alert: ((title, message, buttons, options) => NativeAlert.alert(
    localizeText(title, i18n) as string,
    localizeText(message, i18n) as string | undefined,
    buttons?.map(button => ({ ...button, text: localizeText(button.text, i18n) as string | undefined })), options,
  )) as typeof NativeAlert.alert,
};
