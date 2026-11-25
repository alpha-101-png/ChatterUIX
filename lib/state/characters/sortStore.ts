import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { Storage } from '@lib/constants/storageKeys'
import { createMMKVStorage } from '@lib/storage/MMKV'

import type { CharacterSortBy, CharacterSortDirection } from './types'

// searchType/searchOrder are persisted keys; preserve their spelling for compatibility.
type CharacterSortStore = {
    showSearch: boolean
    searchOrder: CharacterSortDirection
    searchType: CharacterSortBy
    setShowSearch: (showSearch: boolean) => void
    tagFilter: string[]
    textFilter: string
    setSortDirection: (direction: CharacterSortDirection) => void
    setSortBy: (sortBy: CharacterSortBy) => void
    setTextFilter: (value: string) => void
    setTagFilter: (filter: string[]) => void
    /**
     * Active folder filter:
     * - `undefined` → show all characters (no folder filter)
     * - `number`    → show only characters in this folder
     * - `null`      → show only characters with no folder
     */
    currentFolderId: number | null | undefined
    setCurrentFolder: (folderId: number | null | undefined) => void
}

export const useCharacterSortStore = create<CharacterSortStore>()(
    persist(
        (set) => ({
            showSearch: false,
            searchType: 'modified',
            searchOrder: 'desc',
            textFilter: '',
            tagFilter: [],
            currentFolderId: undefined,
            setShowSearch: (showSearch) => {
                set(showSearch ? { showSearch } : { showSearch, tagFilter: [], textFilter: '' })
            },

            setTextFilter: (textFilter: string) => {
                set({
                    textFilter: textFilter,
                })
            },
            setTagFilter: (tagFilter: string[]) => {
                set({
                    tagFilter: tagFilter,
                })
            },
            setSortDirection: (direction) => set({ searchOrder: direction }),
            setSortBy: (sortBy) => set({ searchType: sortBy }),
            setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),
        }),
        {
            name: Storage.CharacterSearch,
            storage: createMMKVStorage(),
            version: 2,
            migrate: (persisted: unknown, version: number) => {
                // version 1 → 2: currentFolderId did not exist, initialize to undefined
                if (version < 2) {
                    return {
                        ...(persisted as object),
                        currentFolderId: undefined,
                    }
                }
                return persisted as CharacterSortStore
            },
            partialize: (item) => ({
                searchType: item.searchType,
                searchOrder: item.searchOrder,
                currentFolderId: item.currentFolderId,
            }),
        }
    )
)
