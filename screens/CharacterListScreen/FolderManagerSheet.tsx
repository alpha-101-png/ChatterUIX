import AntDesign from '@react-native-vector-icons/ant-design/static'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import IconButton from '@components/buttons/IconButton'
import ListButton from '@components/buttons/ListButton'
import TText from '@components/text/TText'
import Alert from '@components/views/Alert'
import BottomSheet, { BottomSheetHeader, useBottomSheetRef, type BottomSheetRef } from '@components/views/BottomSheet'
import BottomSheetControls, { BottomSheetButton } from '@components/views/BottomSheetControls'
import { EdgeFadeFlatList } from '@components/views/EdgeFade'
import InputSheet from '@components/views/InputSheet'
import { useLiveQueryAsync } from '@lib/hooks/liveQuery'
import { Characters } from '@lib/state/characters'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'

type FolderManagerSheetProps = {
    ref: BottomSheetRef
}

const FolderManagerSheet = ({ ref }: FolderManagerSheetProps) => {
    const { t } = useTranslation()
    const { color } = Theme.useTheme()
    const renameRef = useBottomSheetRef()
    const [editingFolder, setEditingFolder] = useState<{ id: number; name: string } | null>(null)

    const { currentFolderId, setCurrentFolder } = useCharacterSortStore(
        useShallow((state) => ({
            currentFolderId: state.currentFolderId,
            setCurrentFolder: state.setCurrentFolder,
        }))
    )

    const { data: folders } = useLiveQueryAsync(Characters.db.folders.liveList(), {
        key: ['folder-list-manager'],
        watch: [{ table: 'character_folders' }, { table: 'character_folder_members' }],
    })

    const handleRename = (folder: { id: number; name: string }) => {
        setEditingFolder(folder)
        renameRef.current?.open()
    }

    const handleConfirmRename = async (name: string) => {
        if (!editingFolder) return
        await Characters.db.folders.rename(editingFolder.id, name.trim())
        Logger.info(t('character.folders.manager.renamed', { name: name.trim(), defaultValue: 'Renamed folder to {{name}}' }))
    }

    const handleDelete = (folder: { id: number; name: string; members: { character_id: number }[] }) => {
        Alert.alert({
            title: t('character.folders.manager.deleteTitle', 'Delete Folder'),
            description: t('character.folders.manager.deleteDescription', { name: folder.name, defaultValue: "Are you sure you want to delete the folder '{{name}}'? Characters inside will become ungrouped." }),
            buttons: [
                { label: t('common.actions.cancel', 'Cancel') },
                {
                    label: t('common.actions.delete', 'Delete'),
                    type: 'warning',
                    onPress: async () => {
                        // If the user is currently viewing this folder, reset to root
                        if (currentFolderId === folder.id) {
                            setCurrentFolder(undefined)
                        }
                        await Characters.db.folders.remove(folder.id)
                        Logger.info(t('character.folders.manager.deleted', { name: folder.name, defaultValue: 'Deleted folder: {{name}}' }))
                    },
                },
            ],
        })
    }

    return (
        <>
            <BottomSheet ref={ref} sheetStyle={{ maxHeight: '85%' }}>
                <BottomSheetHeader
                    title={t('character.folders.manager.title', 'Manage Folders')}
                    style={{ paddingHorizontal: 16, paddingVertical: 16 }}
                />
                <EdgeFadeFlatList
                    containerStyle={{ flexShrink: 1 }}
                    data={folders}
                    keyExtractor={(item) => String(item.id)}
                    style={{ flexGrow: 0, flexShrink: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingVertical: 4,
                        rowGap: 8,
                    }}
                    ListEmptyComponent={
                        <View style={{ paddingVertical: 16 }}>
                            <TText color="400">{t('character.folders.empty', 'No folders yet')}</TText>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                columnGap: 8,
                            }}>
                            <ListButton
                                style={{
                                    flex: 1,
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                    minHeight: 48,
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    columnGap: 8,
                                }}
                                onPress={() => handleRename(item)}>
                                <View
                                    style={{
                                        flex: 1,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        columnGap: 6,
                                    }}>
                                    <TText style={{ flexShrink: 1 }} numberOfLines={1}>
                                        {item.name}
                                    </TText>
                                    {item.isPinned && (
                                        <AntDesign
                                            name="pushpin"
                                            size={13}
                                            color={color.primary._500}
                                        />
                                    )}
                                </View>
                                <TText color="500" size={12}>
                                    {t('character.folders.manager.memberCount', {
                                        count: item.members.length,
                                        defaultValue: '{{count}} characters',
                                    })}
                                </TText>
                            </ListButton>
                            <IconButton
                                iconName="delete"
                                variant="tertiary"
                                level="error"
                                iconSize={20}
                                accessibilityLabel={t(
                                    'character.folders.manager.deleteTitle',
                                    'Delete Folder'
                                )}
                                onPress={() => handleDelete(item)}
                            />
                        </View>
                    )}
                />
                <BottomSheetControls>
                    <BottomSheetButton
                        variant="secondary"
                        label={t('common.actions.close', 'Close')}
                        onPress={() => ref.current?.close()}
                    />
                </BottomSheetControls>
            </BottomSheet>

            {/* Rename input sheet — rendered outside the manager sheet so it stacks on top */}
            <InputSheet
                ref={renameRef}
                title={t('character.folders.manager.renameTitle', 'Rename Folder')}
                placeholder={t('character.folders.manager.renamePlaceholder', 'New folder name…')}
                defaultValue={editingFolder?.name ?? ''}
                inputKey={editingFolder?.id}
                rememberInput
                confirmLabel={t('common.actions.save', 'Save')}
                verifyText={(text) =>
                    text.trim().length === 0 ? t('character.folders.errors.nameEmpty', 'Folder name cannot be empty') : ''
                }
                onConfirm={handleConfirmRename}
                bodyContainerStyle={{ paddingTop: 16 }}
            />
        </>
    )
}

export default FolderManagerSheet
