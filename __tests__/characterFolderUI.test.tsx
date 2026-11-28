import React, { act } from 'react'

import CharacterListing from '../screens/CharacterListScreen/CharacterListing'
import FolderListing from '../screens/CharacterListScreen/FolderListing'
import type { CharacterCardSummary } from '../lib/state/characters'

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
            typeof defaultValue === 'string' ? defaultValue : _key,
    }),
}))

jest.mock('@react-native-vector-icons/ant-design/static', () => ({
    __esModule: true,
    default: (props: object) => require('react').createElement('AntDesign', props),
}))

jest.mock('../lib/theme/ThemeManager', () => ({
    Theme: {
        useTheme: () => ({
            color: {
                neutral: { _100: '#111111', _200: '#222222' },
                primary: { _500: '#7755cc' },
                text: { _100: '#ffffff', _300: '#cccccc', _400: '#999999', _500: '#777777' },
                error: { _300: '#ff6666' },
            },
            spacing: { xs: 2, s: 4, sm: 6, m: 8, l: 12, xl: 16 },
            borderRadius: { m: 8, l: 12, xl: 16 },
            fontSize: { s: 12, m: 14, l: 16 },
        }),
    },
}))

jest.mock('../components/views/ContextMenu', () => {
    const React = require('react')
    const Root = ({ children, ...props }: any) =>
        React.createElement('ContextMenuRoot', props, children)
    const Trigger = ({ children, ...props }: any) =>
        React.createElement('ContextMenuTrigger', props, children)
    const Body = ({ children, ...props }: any) =>
        React.createElement('ContextMenuBody', props, children)
    const Button = (props: any) => React.createElement('ContextMenuButton', props)
    return {
        __esModule: true,
        default: Object.assign(Root, { Trigger, Body, Button }),
    }
})

jest.mock('react-native-mmkv', () => ({
    useMMKVBoolean: () => [false],
}))

jest.mock('../lib/storage/MMKV', () => ({
    createMMKVStorage: () => ({
        getItem: () => null,
        setItem: jest.fn(),
        removeItem: jest.fn(),
    }),
}))

jest.mock('../lib/state/characters/selectionStore', () => ({
    useSelectionStore: (
        selector: (s: { selectionMode: boolean; selectedIds: number[] }) => unknown
    ) => selector({ selectionMode: false, selectedIds: [] }),
}))

jest.mock('../lib/state/characters/sortStore', () => ({
    useCharacterSortStore: (selector: (s: unknown) => unknown) =>
        selector({
            setShowSearch: jest.fn(),
            setTagFilter: jest.fn(),
            tagFilter: [],
        }),
}))

jest.mock('../lib/state/characters', () => ({
    Characters: {
        getCardImageUri: (id: number) => `/cards/${id}.png`,
    },
}))

jest.mock('../components/views/Avatar', () => ({
    __esModule: true,
    default: (props: object) => require('react').createElement('Avatar', props),
}))

jest.mock('../screens/CharacterListScreen/CharacterActionsMenu', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
        require('react').createElement('CharacterActionsMenu', null, children),
}))

jest.mock('../screens/CharacterListScreen/CharacterListingTags', () => ({
    __esModule: true,
    default: () => null,
}))

const { create } = require('react-test-renderer')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

test('custom folder row shows pushpin when pinned and exposes Pin/Rename/Delete on long press', () => {
    const onPress = jest.fn()
    const onTogglePin = jest.fn()
    const onRename = jest.fn()
    const onDelete = jest.fn()
    const folder = { id: 3, name: 'Sci-Fi', memberCount: 4, isPinned: true }

    let renderer: any
    act(() => {
        renderer = create(
            <FolderListing
                folder={folder}
                onPress={onPress}
                onTogglePin={onTogglePin}
                onRename={onRename}
                onDelete={onDelete}
            />
        )
    })

    const icons = renderer.root.findAllByType('AntDesign')
    expect(icons.some((icon: any) => icon.props.name === 'pushpin')).toBe(true)

    const trigger = renderer.root.findByType('ContextMenuTrigger')
    expect(trigger.props.longPress).toBe(true)
    trigger.props.onPress()
    expect(onPress).toHaveBeenCalledWith(folder)

    const buttons = renderer.root.findAllByType('ContextMenuButton')
    expect(buttons.map((b: any) => b.props.label)).toEqual(['Unpin', 'Rename', 'Delete'])

    const close = jest.fn()
    buttons[0].props.onPress(close)
    buttons[1].props.onPress(close)
    buttons[2].props.onPress(close)
    expect(close).toHaveBeenCalledTimes(3)
    expect(onTogglePin).toHaveBeenCalledWith(folder)
    expect(onRename).toHaveBeenCalledWith(folder)
    expect(onDelete).toHaveBeenCalledWith(folder)

    act(() => {
        renderer.update(
            <FolderListing
                folder={{ ...folder, isPinned: false }}
                onPress={onPress}
                onTogglePin={onTogglePin}
                onRename={onRename}
                onDelete={onDelete}
            />
        )
    })
    const updatedIcons = renderer.root.findAllByType('AntDesign')
    expect(updatedIcons.some((icon: any) => icon.props.name === 'pushpin')).toBe(false)
    expect(renderer.root.findAllByType('ContextMenuButton')[0].props.label).toBe('Pin')

    act(() => renderer.unmount())
})

test('virtual Ungrouped folder row excludes ContextMenu and pushpin', () => {
    const onPress = jest.fn()
    const ungrouped = { id: -1, name: 'Ungrouped', memberCount: 2, isPinned: true }

    let renderer: any
    act(() => {
        renderer = create(<FolderListing folder={ungrouped} onPress={onPress} />)
    })

    expect(renderer.root.findAllByType('ContextMenuRoot')).toHaveLength(0)
    const icons = renderer.root.findAllByType('AntDesign')
    expect(icons.some((icon: any) => icon.props.name === 'pushpin')).toBe(false)

    act(() => renderer.unmount())
})

test('CharacterListing renders folder badge only during global search', () => {
    const baseCharacter: CharacterCardSummary = {
        id: 10,
        name: 'Alice',
        image_id: 1,
        last_modified: 0,
        isPinned: false,
        tags: [],
        links: [],
        folderId: 5,
        folderName: 'Favorites',
    }
    const navRef = { current: false }

    let renderer: any
    act(() => {
        renderer = create(
            <CharacterListing
                character={baseCharacter}
                navigationPending={navRef}
                showFolderBadge
            />
        )
    })

    const texts = renderer.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain('Favorites')

    act(() => {
        renderer.update(
            <CharacterListing
                character={{ ...baseCharacter, folderId: null, folderName: null }}
                navigationPending={navRef}
                showFolderBadge
            />
        )
    })
    const ungroupedTexts = renderer.root
        .findAllByType('Text')
        .map((node: any) => node.props.children)
    expect(ungroupedTexts).toContain('Ungrouped')

    act(() => {
        renderer.update(
            <CharacterListing
                character={baseCharacter}
                navigationPending={navRef}
                showFolderBadge={false}
            />
        )
    })
    const hiddenTexts = renderer.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(hiddenTexts).not.toContain('Favorites')

    act(() => renderer.unmount())
})
