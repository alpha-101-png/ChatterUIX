import { create } from 'zustand'

type SelectionStore = {
    selectionMode: boolean
    selectedIds: number[]
    enterSelectionMode: (initialId?: number) => void
    exitSelectionMode: () => void
    toggleSelection: (id: number) => void
    selectAll: (ids: number[]) => void
    deselectAll: () => void
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
    selectionMode: false,
    selectedIds: [],

    enterSelectionMode: (initialId) =>
        set({
            selectionMode: true,
            selectedIds: initialId !== undefined ? [initialId] : [],
        }),

    exitSelectionMode: () =>
        set({
            selectionMode: false,
            selectedIds: [],
        }),

    toggleSelection: (id) =>
        set((state) => ({
            selectedIds: state.selectedIds.includes(id)
                ? state.selectedIds.filter((i) => i !== id)
                : [...state.selectedIds, id],
        })),

    selectAll: (ids) => set({ selectedIds: ids }),

    deselectAll: () => set({ selectedIds: [] }),
}))
