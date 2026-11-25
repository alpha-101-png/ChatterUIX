import { usePathname } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
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
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { TagHider } from '@lib/state/TagHider'

import CharacterListHeader from './CharacterListHeader'
import CharacterListing from './CharacterListing'
import CharacterNewMenu from './CharacterNewMenu'
import CharactersEmpty from './CharactersEmpty'
import CharactersSearchEmpty from './CharactersSearchEmpty'
import FolderListing, { type FolderListingItem } from './FolderListing'

const PAGE_SIZE = 30

// ---------------------------------------------------------------------------
// Discriminated union for the mixed FlatList items (Phase 4)
// ---------------------------------------------------------------------------
type FolderRow = { kind: 'folder'; folder: FolderListingItem }
type CharacterRow = { kind: 'character'; character: CharacterCardSummary }
type ListRow = FolderRow | CharacterRow

const CharacterList: React.FC = () => {
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

    // Character live query — passes folderId for server-side filtering
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
            folderId: currentFolderId,
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

    // Folder live query — only used at root (no active folder)
    const { data: folderData } = useLiveQueryAsync(Characters.db.folders.liveList(), {
        key: ['folder-list-main'],
        watch: [{ table: 'character_folders' }, { table: 'character_folder_members' }],
    })

    const characterList: CharacterCardSummary[] = useMemo(() => {
        return data.map((item) => ({
            ...item,
            latestChatId: item.chats[0]?.id,
            latestSwipeText: item.chats[0]?.messages[0]?.swipes[0]?.swipe,
            latestMessageName: item.chats[0]?.messages[0]?.name,
            last_modified: item.last_modified ?? 0,
            tags: item.tags.map((item) => item.tag.tag),
            folderId: item.folder_membership?.folder_id ?? null,
        }))
    }, [data])

    // Phase 4: build the mixed list
    // At the root view (no folder selected), prepend folder rows above character rows.
    // Inside a folder, show only character rows (filtering is already done by cardListWindow).
    const listRows: ListRow[] = useMemo(() => {
        const isRoot = currentFolderId === undefined
        if (!isRoot) {
            return characterList.map((c) => ({ kind: 'character', character: c }))
        }

        // Build folder rows — only show folders that are not hidden by textFilter
        const folderRows: FolderRow[] = folderData
            .filter((f) => !textFilter || f.name.toLocaleLowerCase().includes(textFilter.toLocaleLowerCase()))
            .map((f) => ({
                kind: 'folder',
                folder: {
                    id: f.id,
                    name: f.name,
                    memberCount: f.members.length,
                },
            }))

        const characterRows: CharacterRow[] = characterList.map((c) => ({
            kind: 'character',
            character: c,
        }))

        return [...folderRows, ...characterRows]
    }, [currentFolderId, folderData, characterList, textFilter])

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

            <CharacterListHeader resultLength={characterList.length} />
            <GuideTarget
                id="main.characters"
                style={{ flex: 1 }}
                layout={LinearTransition.duration(200)}>
                <Animated.FlatList<ListRow>
                    itemLayoutAnimation={LinearTransition}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ rowGap: 16 }}
                    data={listRows}
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
                                    onPress={(f) => setCurrentFolder(f.id)}
                                />
                            )
                        }
                        return (
                            <CharacterListing
                                character={item.character}
                                navigationPending={navigationPending}
                            />
                        )
                    }}
                    onEndReachedThreshold={1}
                    onEndReached={() => {
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
                    ListEmptyComponent={() => data.length === 0 && updatedAt && <CharactersEmpty />}
                />
            </GuideTarget>

            {characterList.length === 0 && data.length !== 0 && updatedAt && (
                <CharactersSearchEmpty />
            )}
        </View>
    )
}

export default CharacterList
