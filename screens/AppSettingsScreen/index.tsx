import Constants from 'expo-constants'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import SettingsLink from '@components/settings/SettingsLink'
import SettingsPage from '@components/settings/SettingsPage'
import TText from '@components/text/TText'
import { Theme } from '@lib/theme/ThemeManager'

import LanguageSettings from './LanguageSettings'

const AppSettingsMenu = () => {
    const { t } = useTranslation()
    const styles = useStyles()
    const appVersion = Constants.expoConfig?.version ?? '1.0'

    return (
        <SettingsPage title={t('settings.title')}>
            <SettingsLink
                href="/settings/appearance"
                icon="skin"
                title={t('settings.categories.appearance.title')}
                description={t('settings.categories.appearance.description')}
            />
            <SettingsLink
                href="/settings/chat"
                icon="message"
                title={t('settings.categories.chat.title')}
                description={t('settings.categories.chat.description')}
            />
            <SettingsLink
                href="/settings/generation"
                icon="control"
                title={t('settings.categories.generation.title')}
                description={t('settings.categories.generation.description')}
            />
            <SettingsLink
                href="/settings/device"
                icon="bell"
                title={t('settings.categories.device.title')}
                description={t('settings.categories.device.description')}
            />
            <SettingsLink
                href="/settings/data"
                icon="database"
                title={t('settings.categories.data.title')}
                description={t('settings.categories.data.description')}
            />
            <SettingsLink
                href="/settings/privacy"
                icon="lock"
                title={t('settings.categories.privacy.title')}
                description={t('settings.categories.privacy.description')}
            />
            <LanguageSettings />
            <SettingsLink
                href="/settings/advanced"
                icon="code"
                title={t('settings.categories.advanced.title')}
                description={t('settings.categories.advanced.description')}
            />
            <View style={styles.footerBadgeContainer}>
                <View style={styles.footerBadge}>
                    <TText color="300" size={12} style={styles.footerTitle}>
                        {t('settings.buildBadge.appName', 'FE Alpha')}
                    </TText>
                    <TText color="500" size={12}>
                        {t('settings.buildBadge.version', {
                            version: appVersion,
                            defaultValue: 'v{{version}}',
                        })}
                    </TText>
                    <View style={styles.customBuildPill}>
                        <TText color="400" size={11} style={styles.customBuildText}>
                            {t('settings.buildBadge.customBuild', 'Custom Build')}
                        </TText>
                    </View>
                </View>
            </View>
        </SettingsPage>
    )
}

export default AppSettingsMenu

const useStyles = () => {
    const { color, spacing, borderRadius, borderWidth } = Theme.useTheme()
    return StyleSheet.create({
        footerBadgeContainer: {
            alignItems: 'center',
            marginTop: spacing.xl2,
            paddingTop: spacing.m,
        },
        footerBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            columnGap: spacing.m,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
            borderRadius: borderRadius.xl,
            backgroundColor: color.neutral._200,
            borderWidth: borderWidth.s,
            borderColor: color.neutral._300,
        },
        footerTitle: {
            fontWeight: '600',
        },
        customBuildPill: {
            paddingHorizontal: spacing.m,
            paddingVertical: spacing.xs,
            borderRadius: borderRadius.l,
            backgroundColor: color.neutral._300,
        },
        customBuildText: {
            fontWeight: '500',
        },
    })
}
