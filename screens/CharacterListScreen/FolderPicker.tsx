import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import ListButton from '@components/buttons/ListButton'
import TText from '@components/text/TText'
import BottomSheet, { BottomSheetHeader, type BottomSheetRef } from '@components/views/BottomSheet'
import BottomSheetControls, { BottomSheetButton } from '@components/views/BottomSheetControls'
import { EdgeFadeFlatList } from '@components/views/EdgeFade'
import { useLiveQueryAsync } from '@lib/hooks/liveQuery'
import { Characters } from '@lib/state/characters'

type FolderPickerProps = {
    ref: BottomSheetRef
    characterId?: number
    characterIds?: number[]
    currentFolderId: number | null | undefined
    onMoved?: () => void
}

const FolderPicker = ({
    ref,
    characterId,
    characterIds,
    currentFolderId,
    onMoved,
}: FolderPickerProps) => {
    const { t } = useTranslation()

    const { data: folders } = useLiveQueryAsync(Characters.db.folders.liveList(), {
        key: ['folder-list'],
        watch: [{ table: 'character_folders' }, { table: 'character_folder_members' }],
    })

    const handleSelect = async (folderId: number | null) => {
        // Batch move when characterIds is provided; otherwise single move
        const ids = characterIds ?? (characterId !== undefined ? [characterId] : [])
        await Characters.db.folders.moveCharacters(ids, folderId)
        ref.current?.close()
        onMoved?.()
    }

    return (
        <BottomSheet ref={ref} sheetStyle={{ maxHeight: '80%' }}>
            <BottomSheetHeader
                title={t('character.folders.picker.title', 'Move to Folder')}
                style={{ paddingHorizontal: 16, paddingVertical: 16 }}
            />
            <EdgeFadeFlatList
                containerStyle={{ flexShrink: 1 }}
                data={folders}
                keyExtractor={(item) => String(item.id)}
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, rowGap: 8 }}
                ListHeaderComponent={
                    <ListButton
                        active={currentFolderId === null}
                        onPress={() => void handleSelect(null)}
                        style={{ paddingHorizontal: 16, paddingVertical: 14, minHeight: 48 }}>
                        <TText color={currentFolderId === null ? '100' : '400'}>
                            {t('character.folders.picker.noFolder', 'Ungrouped')}
                        </TText>
                    </ListButton>
                }
                ListEmptyComponent={
                    <View style={{ paddingVertical: 12 }}>
                        <TText color="400">{t('character.folders.empty', 'No folders yet')}</TText>
                    </View>
                }
                renderItem={({ item }) => {
                    const selected = currentFolderId === item.id
                    return (
                        <ListButton
                            active={selected}
                            onPress={() => void handleSelect(item.id)}
                            style={{ paddingHorizontal: 16, paddingVertical: 14, minHeight: 48 }}>
                            <TText color={selected ? '100' : '300'}>{item.name}</TText>
                        </ListButton>
                    )
                }}
            />
            <BottomSheetControls>
                <BottomSheetButton
                    variant="secondary"
                    label={t('common.actions.close', 'Close')}
                    onPress={() => ref.current?.close()}
                />
            </BottomSheetControls>
        </BottomSheet>
    )
}

export default FolderPicker
