import { useFocusEffect, usePathname } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import GuideHost from '@components/guides/GuideHost'
import GuideTarget from '@components/guides/GuideTarget'
import Alert from '@components/views/Alert'
import { useBottomSheetRef } from '@components/views/BottomSheet'
import Drawer from '@components/views/Drawer'
import HeaderButton from '@components/views/HeaderButton'
import HeaderTitle from '@components/views/HeaderTitle'
import InputSheet from '@components/views/InputSheet'
import { useLiveQueryAsync } from '@lib/hooks/liveQuery'
import { Characters, CharacterCardSummary } from '@lib/state/characters'
import { useSelectionStore } from '@lib/state/characters/selectionStore'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { Logger } from '@lib/state/Logger'
import { TagHider } from '@lib/state/TagHider'

import CharacterListHeader from './CharacterListHeader'
import CharacterListing from './CharacterListing'
import CharacterNewMenu from './CharacterNewMenu'
import CharactersEmpty from './CharactersEmpty'
import CharactersSearchEmpty from './CharactersSearchEmpty'
import FolderListing, { type FolderListingItem } from './FolderListing'
import SelectionBar from './SelectionBar'

const PAGE_SIZE = 30

// ---------------------------------------------------------------------------
// Discriminated union for the mixed FlatList items
// ---------------------------------------------------------------------------
type FolderRow = { kind: 'folder'; folder: FolderListingItem }
type CharacterRow = { kind: 'character'; character: CharacterCardSummary }
type ListRow = FolderRow | CharacterRow

const CharacterList: React.FC = () => {
    const { t } = useTranslation()
    const navigationPending = useRef(false)
    const { sortBy, sortDirection, tagFilter, textFilter, currentFolderId, setCurrentFolder } =
        useCharacterSortStore(
            useShallow((state) => ({
                sortBy: state.searchType,
                sortDirection: state.searchOrder,
                tagFilter: state.tagFilter,
                textFilter: state.textFilter,
                currentFolderId: state.currentFolderId,
                setCurrentFolder: state.setCurrentFolder,
            }))
        )
    const hiddenTags = TagHider.useHiddenTags()
    const [pages, setPages] = useState(3)
    const [previousLength, setPreviousLength] = useState(0)
    const renameRef = useBottomSheetRef()
    const [editingFolder, setEditingFolder] = useState<{ id: number; name: string } | null>(null)

    const { selectionMode, exitSelectionMode } = useSelectionStore(
        useShallow((state) => ({
            selectionMode: state.selectionMode,
            exitSelectionMode: state.exitSelectionMode,
        }))
    )

    const isRoot = currentFolderId === undefined
    const trimmedSearch = textFilter.trim()
    const isGlobalSearch = isRoot && (trimmedSearch.length > 0 || tagFilter.length > 0)

    // Exit selection mode and reset pagination when switching folders or global search
    useEffect(() => {
        exitSelectionMode()
        setPages(3)
        setPreviousLength(0)
    }, [currentFolderId, isGlobalSearch, exitSelectionMode])

    useEffect(() => {
        if (editingFolder) {
            renameRef.current?.open()
        }
    }, [editingFolder, renameRef])

    const handleTogglePinFolder = async (folder: FolderListingItem) => {
        if (folder.id === -1) return
        await Characters.db.folders.setPinned(folder.id, !folder.isPinned)
    }

    const handleRenameFolder = (folder: FolderListingItem) => {
        if (folder.id === -1) return
        setEditingFolder({ id: folder.id, name: folder.name })
    }

    const handleConfirmRenameFolder = async (name: string) => {
        if (!editingFolder) return
        const trimmed = name.trim()
        if (!trimmed) return
        await Characters.db.folders.rename(editingFolder.id, trimmed)
        Logger.info(
            t('character.folders.manager.renamed', {
                name: trimmed,
                defaultValue: 'Renamed folder to {{name}}',
            })
        )
    }

    const handleDeleteFolder = (folder: FolderListingItem) => {
        if (folder.id === -1) return
        Alert.alert({
            title: t('character.folders.manager.deleteTitle', 'Delete Folder'),
            description: t('character.folders.manager.deleteDescription', {
                name: folder.name,
                defaultValue:
                    "Are you sure you want to delete the folder '{{name}}'? Characters inside will become ungrouped.",
            }),
            buttons: [
                { label: t('common.actions.cancel', 'Cancel') },
                {
                    label: t('common.actions.delete', 'Delete'),
                    type: 'warning',
                    onPress: async () => {
                        if (useCharacterSortStore.getState().currentFolderId === folder.id) {
                            setCurrentFolder(undefined)
                        }
                        await Characters.db.folders.remove(folder.id)
                        Logger.info(
                            t('character.folders.manager.deleted', {
                                name: folder.name,
                                defaultValue: 'Deleted folder: {{name}}',
                            })
                        )
                    },
                },
            ],
        })
    }

    useFocusEffect(
        useCallback(() => {
            const handler = BackHandler.addEventListener('hardwareBackPress', () => {
                if (useSelectionStore.getState().selectionMode) {
                    useSelectionStore.getState().exitSelectionMode()
                    return true
                }
                if (useCharacterSortStore.getState().currentFolderId !== undefined) {
                    useCharacterSortStore.getState().setCurrentFolder(undefined)
                    return true
                }
                return false
            })
            return () => handler.remove()
        }, [])
    )

    // Character live query — active inside a folder (including Ungrouped) or during global root search
    const { data, updatedAt } = useLiveQueryAsync(
        Characters.db.live.cardListWindow({
            type: 'character',
            sortBy: sortBy,
            sortDirection: sortDirection,
            limit: PAGE_SIZE * pages,
            offset: 0,
            searchText: textFilter,
            includedTags: tagFilter,
            hiddenTags: hiddenTags,
            folderId: isRoot ? undefined : currentFolderId,
        }),
        {
            key: [
                'character-list',
                sortBy,
                sortDirection,
                textFilter,
                tagFilter,
                hiddenTags,
                pages,
                currentFolderId,
                isGlobalSearch,
            ],
            enabled: !isRoot || isGlobalSearch,
            watch: [
                { table: 'characters' },
                { table: 'characterLinks' },
                { table: 'character_tags' },
                { table: 'tags' },
                { table: 'chats' },
                { table: 'chat_entries' },
                { table: 'chat_swipes' },
                { table: 'character_folders' },
                { table: 'character_folder_members' },
            ],
        }
    )

    // Exact live count of ungrouped characters for the root view
    const { data: ungroupedCountRows } = useLiveQueryAsync(
        Characters.db.folders.ungroupedCount(),
        {
            key: ['ungrouped-count'],
            enabled: isRoot,
            watch: [{ table: 'characters' }, { table: 'character_folder_members' }],
        }
    )
    const ungroupedCount = ungroupedCountRows[0]?.count ?? 0

    // Folder live query
    const { data: folderData } = useLiveQueryAsync(Characters.db.folders.liveList(), {
        key: ['folder-list-main'],
        watch: [{ table: 'character_folders' }, { table: 'character_folder_members' }],
    })

    const characterList: CharacterCardSummary[] = useMemo(() => {
        if (isRoot && !isGlobalSearch) return []
        return data.map((item) => ({
            ...item,
            latestChatId: item.chats[0]?.id,
            latestSwipeText: item.chats[0]?.messages[0]?.swipes[0]?.swipe,
            latestMessageName: item.chats[0]?.messages[0]?.name,
            last_modified: item.last_modified ?? 0,
            tags: item.tags.map((tagItem) => tagItem.tag.tag),
            folderId: item.folder_membership?.folder_id ?? null,
            folderName: item.folder_membership?.folder?.name ?? null,
        }))
    }, [data, isRoot, isGlobalSearch])

    // Build the list: root shows folders + Ungrouped (or matching characters during global search); inside a folder shows characters
    const listRows: ListRow[] = useMemo(() => {
        if (!isRoot || isGlobalSearch) {
            return characterList.map((c) => ({ kind: 'character', character: c }))
        }

        const folderRows: FolderRow[] = folderData.map((f) => ({
            kind: 'folder',
            folder: {
                id: f.id,
                name: f.name,
                memberCount: f.members.length,
                isPinned: f.isPinned,
            },
        }))

        // Virtual "Ungrouped" folder — live unassigned count
        const ungroupedRow: FolderRow = {
            kind: 'folder',
            folder: {
                id: -1, // sentinel for "Ungrouped"
                name: t('character.folders.ungrouped', 'Ungrouped'),
                memberCount: ungroupedCount,
            },
        }

        return [...folderRows, ungroupedRow]
    }, [isRoot, isGlobalSearch, folderData, characterList, ungroupedCount, t])

    // All character IDs in the current view (for Select All)
    const allCharacterIds = useMemo(() => characterList.map((c) => c.id), [characterList])

    const hasSearchFilter = Boolean(trimmedSearch || tagFilter.length > 0)

    // do not render when not shown, optimizes some rerenders
    const settingsOpen = Drawer.useDrawerStore((state) => !!state.values[Drawer.ID.SETTINGS])
    const path = usePathname()
    if (path !== '/') return

    return (
        <View style={{ flex: 1, paddingTop: 8 }}>
            <GuideHost id="main-ui" enabled={!settingsOpen} />
            <HeaderTitle />
            <HeaderButton
                headerLeft={() => (
                    <GuideTarget id="main.menu">
                        <Drawer.Button drawerID={Drawer.ID.SETTINGS} />
                    </GuideTarget>
                )}
                headerRight={() => (
                    <GuideTarget id="main.import">
                        <CharacterNewMenu navigationPending={navigationPending} />
                    </GuideTarget>
                )}
            />

            <CharacterListHeader
                resultLength={isRoot && !isGlobalSearch ? listRows.length : characterList.length}
            />
            <GuideTarget
                id="main.characters"
                style={{ flex: 1 }}
                layout={LinearTransition.duration(200)}>
                <Animated.FlatList<ListRow>
                    itemLayoutAnimation={LinearTransition}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ rowGap: 16 }}
                    data={listRows}
                    extraData={`${selectionMode}-${isGlobalSearch}`}
                    keyExtractor={(item) =>
                        item.kind === 'folder'
                            ? `folder-${item.folder.id}`
                            : `char-${item.character.id}`
                    }
                    renderItem={({ item }) => {
                        if (item.kind === 'folder') {
                            return (
                                <FolderListing
                                    folder={item.folder}
                                    menuDisabled={path !== '/'}
                                    onPress={(f) => {
                                        if (f.id === -1) {
                                            setCurrentFolder(null)
                                        } else {
                                            setCurrentFolder(f.id)
                                        }
                                    }}
                                    onTogglePin={handleTogglePinFolder}
                                    onRename={handleRenameFolder}
                                    onDelete={handleDeleteFolder}
                                />
                            )
                        }
                        return (
                            <CharacterListing
                                character={item.character}
                                navigationPending={navigationPending}
                                showFolderBadge={isGlobalSearch}
                            />
                        )
                    }}
                    onEndReachedThreshold={1}
                    onEndReached={() => {
                        if (isRoot && !isGlobalSearch) return
                        if (previousLength === data.length) {
                            return
                        }
                        setPreviousLength(data.length)
                        setPages(pages + 1)
                    }}
                    windowSize={3}
                    onStartReachedThreshold={0.1}
                    onStartReached={() => {
                        if (pages !== 3) setPages(3)
                    }}
                    ListEmptyComponent={() => {
                        if (isRoot && !isGlobalSearch) {
                            return hasSearchFilter ? <CharactersSearchEmpty /> : null
                        }
                        if (!updatedAt) return null
                        return hasSearchFilter ? <CharactersSearchEmpty /> : <CharactersEmpty />
                    }}
                />
            </GuideTarget>

            <InputSheet
                ref={renameRef}
                title={t('character.folders.manager.renameTitle', 'Rename Folder')}
                placeholder={t('character.folders.manager.renamePlaceholder', 'New folder name…')}
                defaultValue={editingFolder?.name ?? ''}
                inputKey={editingFolder?.id}
                autoFocus
                confirmLabel={t('common.actions.save', 'Save')}
                verifyText={(text) =>
                    text.trim().length === 0
                        ? t('character.folders.errors.nameEmpty', 'Folder name cannot be empty')
                        : ''
                }
                onConfirm={handleConfirmRenameFolder}
                onClose={() => setEditingFolder(null)}
                bodyContainerStyle={{ paddingTop: 16 }}
            />

            {/* Selection bar at bottom */}
            {selectionMode && <SelectionBar allCharacterIds={allCharacterIds} />}
        </View>
    )
}

export default CharacterList
