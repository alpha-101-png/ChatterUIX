import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

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

type FolderManagerSheetProps = {
    ref: BottomSheetRef
}

const FolderManagerSheet = ({ ref }: FolderManagerSheetProps) => {
    const { t } = useTranslation()
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
        Logger.info(t('character.folders.manager.renamed', { name: name.trim() }))
    }

    const handleDelete = (folder: { id: number; name: string; members: { character_id: number }[] }) => {
        Alert.alert({
            title: t('character.folders.manager.deleteTitle'),
            description: t('character.folders.manager.deleteDescription', { name: folder.name }),
            buttons: [
                { label: t('common.actions.cancel') },
                {
                    label: t('common.actions.delete'),
                    type: 'warning',
                    onPress: async () => {
                        // If the user is currently viewing this folder, reset to "All"
                        if (currentFolderId === folder.id) {
                            setCurrentFolder(undefined)
                        }
                        await Characters.db.folders.remove(folder.id)
                        Logger.info(t('character.folders.manager.deleted', { name: folder.name }))
                    },
                },
            ],
        })
    }

    return (
        <>
            <BottomSheet ref={ref} sheetStyle={{ maxHeight: '85%' }}>
                <BottomSheetHeader
                    title={t('character.folders.manager.title')}
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
                            <TText color="400">{t('character.folders.empty')}</TText>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <ListButton
                            style={{
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                minHeight: 48,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                            onPress={() => handleRename(item)}>
                            <TText style={{ flex: 1 }}>{item.name}</TText>
                            <TText color="500" size={12}>
                                {t('character.folders.manager.memberCount', {
                                    count: item.members.length,
                                })}
                            </TText>
                        </ListButton>
                    )}
                />
                <BottomSheetControls>
                    <BottomSheetButton
                        variant="secondary"
                        label={t('common.actions.close')}
                        onPress={() => ref.current?.close()}
                    />
                </BottomSheetControls>
            </BottomSheet>

            {/* Rename input sheet — rendered outside the manager sheet so it stacks on top */}
            <InputSheet
                ref={renameRef}
                title={t('character.folders.manager.renameTitle')}
                placeholder={t('character.folders.manager.renamePlaceholder')}
                defaultValue={editingFolder?.name ?? ''}
                inputKey={editingFolder?.id}
                rememberInput
                confirmLabel={t('common.actions.save')}
                verifyText={(text) =>
                    text.trim().length === 0 ? t('character.folders.errors.nameEmpty') : ''
                }
                onConfirm={handleConfirmRename}
                bodyContainerStyle={{ paddingTop: 16 }}
            />
        </>
    )
}

export default FolderManagerSheet
