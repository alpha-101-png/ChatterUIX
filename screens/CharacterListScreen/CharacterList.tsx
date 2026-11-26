import { usePathname } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import GuideHost from '@components/guides/GuideHost'
import GuideTarget from '@components/guides/GuideTarget'
import Drawer from '@components/views/Drawer'
import HeaderButton from '@components/views/HeaderButton'
import HeaderTitle from '@components/views/HeaderTitle'
import { useLiveQueryAsync } from '@lib/hooks/liveQuery'
import { Characters, CharacterCardSummary } from '@lib/state/characters'
import { useSelectionStore } from '@lib/state/characters/selectionStore'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
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

    const { selectionMode, selectedIds, exitSelectionMode } = useSelectionStore(
        useShallow((state) => ({
            selectionMode: state.selectionMode,
            selectedIds: state.selectedIds,
            exitSelectionMode: state.exitSelectionMode,
        }))
    )

    const isRoot = currentFolderId === undefined

    // Exit selection mode and reset pagination when switching folders
    useEffect(() => {
        exitSelectionMode()
        setPages(3)
        setPreviousLength(0)
    }, [currentFolderId, exitSelectionMode])

    // Character live query — only active inside a folder (including Ungrouped)
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
            folderId: isRoot ? null : currentFolderId,
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
            ],
            enabled: !isRoot,
            watch: [
                { table: 'characters' },
                { table: 'characterLinks' },
                { table: 'character_tags' },
                { table: 'tags' },
                { table: 'chats' },
                { table: 'chat_entries' },
                { table: 'chat_swipes' },
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
        if (isRoot) return []
        return data.map((item) => ({
            ...item,
            latestChatId: item.chats[0]?.id,
            latestSwipeText: item.chats[0]?.messages[0]?.swipes[0]?.swipe,
            latestMessageName: item.chats[0]?.messages[0]?.name,
            last_modified: item.last_modified ?? 0,
            tags: item.tags.map((tagItem) => tagItem.tag.tag),
            folderId: item.folder_membership?.folder_id ?? null,
        }))
    }, [data, isRoot])

    // Build the list: root shows ONLY folders + Ungrouped; inside a folder shows ONLY characters
    const listRows: ListRow[] = useMemo(() => {
        if (!isRoot) {
            return characterList.map((c) => ({ kind: 'character', character: c }))
        }

        const folderRows: FolderRow[] = folderData
            .filter(
                (f) =>
                    !textFilter ||
                    f.name.toLocaleLowerCase().includes(textFilter.toLocaleLowerCase())
            )
            .map((f) => ({
                kind: 'folder',
                folder: {
                    id: f.id,
                    name: f.name,
                    memberCount: f.members.length,
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

        const showUngrouped =
            !textFilter ||
            ungroupedRow.folder.name.toLocaleLowerCase().includes(textFilter.toLocaleLowerCase())

        return [...folderRows, ...(showUngrouped ? [ungroupedRow] : [])]
    }, [isRoot, folderData, characterList, ungroupedCount, textFilter, t])

    // All character IDs in the current view (for Select All)
    const allCharacterIds = useMemo(() => characterList.map((c) => c.id), [characterList])

    const hasSearchFilter = Boolean(textFilter || tagFilter.length > 0)

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

            <CharacterListHeader resultLength={isRoot ? listRows.length : characterList.length} />
            <GuideTarget
                id="main.characters"
                style={{ flex: 1 }}
                layout={LinearTransition.duration(200)}>
                <Animated.FlatList<ListRow>
                    itemLayoutAnimation={LinearTransition}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ rowGap: 16 }}
                    data={listRows}
                    extraData={selectedIds}
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
                                    onPress={(f) => {
                                        if (f.id === -1) {
                                            setCurrentFolder(null)
                                        } else {
                                            setCurrentFolder(f.id)
                                        }
                                    }}
                                />
                            )
                        }
                        return (
                            <CharacterListing
                                character={item.character}
                                navigationPending={navigationPending}
                                selectionMode={selectionMode}
                                selected={
                                    selectionMode && selectedIds.includes(item.character.id)
                                }
                            />
                        )
                    }}
                    onEndReachedThreshold={1}
                    onEndReached={() => {
                        if (isRoot) return
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
                        if (isRoot) {
                            return hasSearchFilter ? <CharactersSearchEmpty /> : null
                        }
                        if (!updatedAt) return null
                        return hasSearchFilter ? <CharactersSearchEmpty /> : <CharactersEmpty />
                    }}
                />
            </GuideTarget>

            {/* Selection bar at bottom */}
            {selectionMode && <SelectionBar allCharacterIds={allCharacterIds} />}
        </View>
    )
}

export default CharacterList
