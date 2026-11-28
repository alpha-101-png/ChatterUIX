import { localDownload } from '@vali98/react-native-fs'
import { reloadAppAsync } from 'expo'
import { getDocumentAsync } from 'expo-document-picker'
import { Paths } from 'expo-file-system'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Text, View } from 'react-native'

import appConfig from '@appconfig'
import ThemedButton from '@components/buttons/ThemedButton'
import SectionTitle from '@components/text/SectionTitle'
import Alert from '@components/views/Alert'
import { migrateData, resetDataMigrationFlags } from '@db/dataMigrations'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import { exportFullBackup, restoreFullBackup } from '@lib/utils/backup'
import { copyFile, deleteFile } from '@lib/utils/File'
import {
    cleanupOrphanedAvatarsAndVacuum,
    formatStorageSize,
    scanOrphanedAvatars,
} from '@lib/utils/storageCleanup'

const appVersion = appConfig.expo.version

// eslint-disable-next-line i18next/no-literal-string
const dbPath = Paths.document.uri + '/SQLite/db.db'

const DatabaseSettings = () => {
    const { t } = useTranslation()
    const { color, spacing } = Theme.useTheme()
    const [busyAction, setBusyAction] = useState<'backup' | 'restore' | 'cleanup' | null>(null)

    const exportDB = async (notify: boolean = true) => {
        await localDownload(dbPath.replace('file://', ''))
            .then(() => {
                if (notify) Logger.infoToast(t('settings.database.toast.downloadOk'))
            })
            .catch((e: string) =>
                Logger.errorToast(t('settings.database.toast.downloadFailed', { error: e }))
            )
    }

    const importDB = async (uri: string, name: string) => {
        const copyDB = async () => {
            await exportDB(false)
            deleteFile(dbPath)
            const result = await copyFile({
                from: uri,
                to: dbPath,
            })
            if (result) {
                resetDataMigrationFlags()
                reloadAppAsync()
            }
        }

        const dbAppVersion = name.split('-')?.[0]
        if (dbAppVersion !== appVersion) {
            Alert.alert({
                title: t('settings.database.alert.versionMismatch.title'),
                description: t('settings.database.alert.versionMismatch.description', {
                    importedVersion: dbAppVersion,
                    currentVersion: appVersion,
                }),
                buttons: [
                    { label: t('common.actions.cancel') },
                    {
                        label: t('settings.database.alert.versionMismatch.confirm'),
                        onPress: copyDB,
                        type: 'warning',
                    },
                ],
            })
        } else copyDB()
    }

    const rerunMigrations = () => {
        Alert.alert({
            title: t('settings.database.alert.rerunMigrations.title'),
            description: t('settings.database.alert.rerunMigrations.description'),
            buttons: [
                { label: t('common.actions.cancel') },
                {
                    label: t('settings.database.alert.rerunMigrations.confirm'),
                    onPress: () => migrateData({ bypass: true }).catch(Logger.stackTrace),
                    type: 'warning',
                },
            ],
        })
    }

    const handleFullBackup = () => {
        if (busyAction) return
        Alert.alert({
            title: t('settings.database.alert.fullBackup.title', 'Full Backup'),
            description: t(
                'settings.database.alert.fullBackup.description',
                'Create a ZIP archive containing your database and all character avatars?'
            ),
            buttons: [
                { label: t('common.actions.cancel', 'Cancel') },
                {
                    label: t('settings.database.alert.fullBackup.confirm', 'Create Backup'),
                    onPress: async () => {
                        setBusyAction('backup')
                        try {
                            await exportFullBackup(appVersion)
                            Logger.infoToast(
                                t('settings.database.toast.fullBackupOk', 'Full backup created!')
                            )
                        } catch (error) {
                            Logger.errorToast(
                                t('settings.database.toast.fullBackupFailed', {
                                    error: error instanceof Error ? error.message : String(error),
                                    defaultValue: 'Failed to create full backup: {{error}}',
                                })
                            )
                        } finally {
                            setBusyAction(null)
                        }
                    },
                },
            ],
        })
    }

    const handleRestoreFullBackup = async () => {
        if (busyAction) return
        const result = await getDocumentAsync({
            copyToCacheDirectory: true,
            type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        })
        if (result.canceled || !result.assets[0]) return
        const pickedUri = result.assets[0].uri
        Alert.alert({
            title: t('settings.database.alert.restoreFullBackup.title', 'Restore Full Backup'),
            description: t(
                'settings.database.alert.restoreFullBackup.description',
                'Are you sure you want to restore from this ZIP backup? This will overwrite your current database and character avatars.\n\nA backup of your current database will be saved first, and the app will restart automatically.'
            ),
            buttons: [
                { label: t('common.actions.cancel', 'Cancel') },
                {
                    label: t('settings.database.alert.restoreFullBackup.confirm', 'Restore Backup'),
                    type: 'warning',
                    onPress: async () => {
                        setBusyAction('restore')
                        try {
                            await restoreFullBackup(pickedUri, {
                                onBeforeReplaceDb: () => exportDB(false),
                            })
                            await reloadAppAsync()
                        } catch (error) {
                            Logger.errorToast(
                                t('settings.database.toast.restoreFullBackupFailed', {
                                    error: error instanceof Error ? error.message : String(error),
                                    defaultValue: 'Failed to restore full backup: {{error}}',
                                })
                            )
                        } finally {
                            setBusyAction(null)
                        }
                    },
                },
            ],
        })
    }

    const handleStorageCleanup = async () => {
        if (busyAction) return
        setBusyAction('cleanup')
        try {
            const scan = await scanOrphanedAvatars()
            const formattedSize = formatStorageSize(scan.totalBytes)
            setBusyAction(null)
            Alert.alert({
                title: t(
                    'settings.database.alert.storageCleanup.title',
                    'Storage Cleanup & Optimize'
                ),
                description:
                    scan.files.length > 0
                        ? t('settings.database.alert.storageCleanup.description', {
                              count: scan.files.length,
                              size: formattedSize,
                              defaultValue:
                                  'Found {{count}} orphaned avatar file(s) ({{size}}) from deleted characters.\n\nConfirm to delete these unreferenced image files and run SQLite VACUUM to compact the database.',
                          })
                        : t('settings.database.alert.storageCleanup.descriptionEmpty', {
                              size: formattedSize,
                              defaultValue:
                                  'Found 0 orphaned avatar files ({{size}}).\n\nConfirm to run SQLite VACUUM to compact and shrink the database.',
                          }),
                buttons: [
                    { label: t('common.actions.cancel', 'Cancel') },
                    {
                        label: t(
                            'settings.database.alert.storageCleanup.confirm',
                            'Clean & Optimize'
                        ),
                        type: scan.files.length > 0 ? 'warning' : 'default',
                        onPress: async () => {
                            setBusyAction('cleanup')
                            try {
                                const result = await cleanupOrphanedAvatarsAndVacuum(scan.files)
                                const freed = formatStorageSize(result.totalBytesFreed)
                                Alert.alert({
                                    title: t(
                                        'settings.database.alert.storageCleanupDone.title',
                                        'Storage Cleanup Complete'
                                    ),
                                    description: t(
                                        'settings.database.alert.storageCleanupDone.description',
                                        {
                                            count: result.deletedCount,
                                            freed: freed,
                                            defaultValue:
                                                'Deleted {{count}} orphaned avatar file(s) and compacted the database.\n\nSpace freed: {{freed}}',
                                        }
                                    ),
                                    buttons: [{ label: t('common.actions.done', 'Done') }],
                                })
                            } catch (error) {
                                Logger.errorToast(
                                    t('settings.database.toast.storageCleanupFailed', {
                                        error:
                                            error instanceof Error ? error.message : String(error),
                                        defaultValue: 'Failed to clean storage: {{error}}',
                                    })
                                )
                            } finally {
                                setBusyAction(null)
                            }
                        },
                    },
                ],
            })
        } catch (error) {
            setBusyAction(null)
            Logger.errorToast(
                t('settings.database.toast.storageCleanupScanFailed', {
                    error: error instanceof Error ? error.message : String(error),
                    defaultValue: 'Failed to scan storage: {{error}}',
                })
            )
        }
    }

    return (
        <View style={{ rowGap: 8 }}>
            <SectionTitle>{t('settings.database.title')}</SectionTitle>

            <Text
                style={{
                    color: color.text._500,
                    paddingBottom: spacing.xs,
                    marginBottom: spacing.m,
                }}>
                {t('settings.database.warningText')}
            </Text>
            <ThemedButton
                label={t('settings.database.exportButton')}
                variant="secondary"
                onPress={() => {
                    Alert.alert({
                        title: t('settings.database.alert.export.title'),
                        description: t('settings.database.alert.export.description'),
                        buttons: [
                            { label: t('common.actions.cancel') },
                            {
                                label: t('settings.database.alert.export.confirm'),
                                onPress: exportDB,
                            },
                        ],
                    })
                }}
            />

            <ThemedButton
                label={t('settings.database.importButton')}
                variant="secondary"
                onPress={async () => {
                    getDocumentAsync({ type: ['application/*'] }).then(async (result) => {
                        if (result.canceled) return
                        Alert.alert({
                            title: t('settings.database.alert.import.title'),
                            description: t('settings.database.alert.import.description'),
                            buttons: [
                                { label: t('common.actions.cancel') },
                                {
                                    label: t('settings.database.alert.import.confirm'),
                                    onPress: () =>
                                        importDB(result.assets[0].uri, result.assets[0].name),
                                    type: 'warning',
                                },
                            ],
                        })
                    })
                }}
            />

            <ThemedButton
                label={t('settings.database.fullBackupButton', 'Full Backup (Database + Avatars)')}
                variant="secondary"
                disabled={busyAction !== null}
                onPress={handleFullBackup}
            />

            <ThemedButton
                label={t('settings.database.restoreFullBackupButton', 'Restore Full Backup (ZIP)')}
                variant="secondary"
                disabled={busyAction !== null}
                onPress={() => {
                    void handleRestoreFullBackup()
                }}
            />

            <ThemedButton
                label={t('settings.database.storageCleanupButton', 'Storage Cleanup & Optimize')}
                variant="secondary"
                disabled={busyAction !== null}
                onPress={() => {
                    void handleStorageCleanup()
                }}
            />

            {busyAction !== null && (
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        columnGap: 8,
                        paddingTop: 4,
                    }}>
                    <ActivityIndicator size="small" color={color.primary._500} />
                    <Text style={{ color: color.text._400 }}>
                        {busyAction === 'backup'
                            ? t('settings.database.fullBackup.working', 'Creating backup…')
                            : busyAction === 'restore'
                              ? t('settings.database.fullBackup.restoring', 'Restoring backup…')
                              : t(
                                    'settings.database.storageCleanup.working',
                                    'Scanning & optimizing storage…'
                                )}
                    </Text>
                </View>
            )}

            <ThemedButton
                label={t('settings.database.rerunMigrationsButton')}
                variant="secondary"
                disabled={busyAction !== null}
                onPress={rerunMigrations}
            />
        </View>
    )
}

export default DatabaseSettings
