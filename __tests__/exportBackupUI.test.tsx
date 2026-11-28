import React, { act } from 'react'

import Alert from '../components/views/Alert'
import { exportCards } from '../lib/state/characters/actions'
import { useSelectionStore } from '../lib/state/characters/selectionStore'
import { exportFullBackup, restoreFullBackup } from '../lib/utils/backup'
import { cleanupOrphanedAvatarsAndVacuum, scanOrphanedAvatars } from '../lib/utils/storageCleanup'
import DatabaseSettings from '../screens/AppSettingsScreen/DatabaseSettings'
import SelectionBar from '../screens/CharacterListScreen/SelectionBar'

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
            spacing: { xs: 2, s: 4, m: 8, l: 12, xl: 16 },
            borderRadius: { m: 8, l: 12, xl: 16 },
            fontSize: { s: 12, m: 14, l: 16 },
        }),
    },
}))

jest.mock('../lib/storage/MMKV', () => ({
    createMMKVStorage: () => ({
        getItem: () => null,
        setItem: jest.fn(),
        removeItem: jest.fn(),
    }),
}))

jest.mock('../lib/state/characters/sortStore', () => ({
    useCharacterSortStore: (selector: (s: { currentFolderId: undefined }) => unknown) =>
        selector({ currentFolderId: undefined }),
}))

jest.mock('../lib/state/characters', () => ({
    Characters: {
        actions: {
            exportCards: jest.fn(),
            deleteCard: jest.fn(),
        },
    },
}))

jest.mock('../lib/state/characters/actions', () => ({
    exportCards: jest.fn(),
}))

jest.mock('../screens/CharacterListScreen/FolderPicker', () => ({
    __esModule: true,
    default: () => null,
}))

jest.mock('../components/views/BottomSheet', () => ({
    useBottomSheetRef: () => ({ current: { open: jest.fn(), close: jest.fn() } }),
}))

jest.mock('../components/views/Alert', () => ({
    __esModule: true,
    default: {
        alert: jest.fn(),
    },
}))

jest.mock('../components/buttons/ThemedButton', () => ({
    __esModule: true,
    default: (props: object) => require('react').createElement('ThemedButton', props),
}))

jest.mock('../components/text/SectionTitle', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
        require('react').createElement('SectionTitle', null, children),
}))

jest.mock('../lib/state/Logger', () => ({
    Logger: { info: jest.fn(), infoToast: jest.fn(), errorToast: jest.fn(), stackTrace: jest.fn() },
}))

jest.mock('@appconfig', () => ({
    __esModule: true,
    default: { expo: { version: '0.8.8' } },
}))

jest.mock('expo', () => ({
    reloadAppAsync: jest.fn(async () => {}),
}))

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}))

jest.mock('expo-file-system', () => ({
    Paths: { document: { uri: 'file:///document/' }, cache: { uri: 'file:///cache/' } },
}))

jest.mock('@vali98/react-native-fs', () => ({
    localDownload: jest.fn(async () => {}),
}))

jest.mock('../db/dataMigrations', () => ({
    migrateData: jest.fn(async () => {}),
    resetDataMigrationFlags: jest.fn(),
}))

jest.mock('../lib/utils/File', () => ({
    copyFile: jest.fn(async () => true),
    deleteFile: jest.fn(() => true),
}))

jest.mock('../lib/utils/backup', () => ({
    exportFullBackup: jest.fn(async () => {}),
    restoreFullBackup: jest.fn(async () => {}),
}))

jest.mock('../lib/utils/storageCleanup', () => ({
    scanOrphanedAvatars: jest.fn(async () => ({ files: [], totalBytes: 0 })),
    cleanupOrphanedAvatarsAndVacuum: jest.fn(async () => ({
        deletedCount: 0,
        deletedBytes: 0,
        dbBytesFreed: 0,
        totalBytesFreed: 0,
    })),
    formatStorageSize: jest.fn((bytes: number) => `${bytes} B`),
}))

const { Characters } = require('../lib/state/characters') as {
    Characters: { actions: { exportCards: jest.Mock } }
}
const { getDocumentAsync } = require('expo-document-picker') as { getDocumentAsync: jest.Mock }
const { reloadAppAsync } = require('expo') as { reloadAppAsync: jest.Mock }
const { create } = require('react-test-renderer')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeEach(() => {
    jest.clearAllMocks()
    useSelectionStore.setState({ selectionMode: true, selectedIds: [1, 2] })
})

test('SelectionBar exports selected characters with progress and exits selection mode', async () => {
    let resolveExport!: (count: number) => void
    Characters.actions.exportCards.mockImplementationOnce(
        (_ids: number[], onProgress: (p: { completed: number; total: number }) => void) =>
            new Promise<number>((resolve) => {
                onProgress({ completed: 1, total: 2 })
                resolveExport = resolve
            })
    )

    let renderer: any
    act(() => {
        renderer = create(<SelectionBar allCharacterIds={[1, 2, 3]} />)
    })

    const exportTextNode = renderer.root
        .findAllByType('Text')
        .find((node: any) => node.props.children === 'Export')
    expect(exportTextNode).toBeDefined()

    let pressable = exportTextNode.parent
    while (pressable && typeof pressable.props.onPress !== 'function') {
        pressable = pressable.parent
    }
    expect(pressable).toBeDefined()

    await act(async () => {
        pressable.props.onPress()
    })

    expect(Characters.actions.exportCards).toHaveBeenCalledWith([1, 2], expect.any(Function))
    expect(renderer.root.findAllByType('ActivityIndicator')).toHaveLength(1)

    await act(async () => {
        resolveExport(2)
    })

    expect(useSelectionStore.getState().selectionMode).toBe(false)
    expect(useSelectionStore.getState().selectedIds).toEqual([])
    act(() => renderer.unmount())
})

test('DatabaseSettings renders Full Backup and Restore Full Backup options and runs flows', async () => {
    let renderer: any
    act(() => {
        renderer = create(<DatabaseSettings />)
    })

    const buttons = renderer.root.findAllByType('ThemedButton')
    const fullBackupBtn = buttons.find(
        (b: any) => b.props.label === 'Full Backup (Database + Avatars)'
    )
    const restoreBtn = buttons.find((b: any) => b.props.label === 'Restore Full Backup (ZIP)')
    expect(fullBackupBtn).toBeDefined()
    expect(restoreBtn).toBeDefined()

    act(() => {
        fullBackupBtn.props.onPress()
    })
    const backupAlert = jest.mocked(Alert.alert).mock.calls[0][0]
    await act(async () => {
        await backupAlert.buttons[1].onPress?.()
    })
    expect(exportFullBackup).toHaveBeenCalledWith('0.8.8')

    getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///picked/backup.zip', name: 'backup.zip' }],
    })
    await act(async () => {
        await restoreBtn.props.onPress()
    })
    const restoreAlert = jest.mocked(Alert.alert).mock.calls[1][0]
    await act(async () => {
        await restoreAlert.buttons[1].onPress?.()
    })
    expect(restoreFullBackup).toHaveBeenCalledWith('file:///picked/backup.zip', {
        onBeforeReplaceDb: expect.any(Function),
    })
    expect(reloadAppAsync).toHaveBeenCalledTimes(1)

    act(() => renderer.unmount())
})

test('DatabaseSettings scans orphaned avatars, confirms cleanup + VACUUM, and shows completion alert', async () => {
    const mockOrphans = [
        { filename: '101.png', uri: 'file:///document/characters/101.png', size: 10240 },
        { filename: '202.png', uri: 'file:///document/characters/202.png', size: 20480 },
    ]
    jest.mocked(scanOrphanedAvatars).mockResolvedValueOnce({
        files: mockOrphans,
        totalBytes: 30720,
    })
    jest.mocked(cleanupOrphanedAvatarsAndVacuum).mockResolvedValueOnce({
        deletedCount: 2,
        deletedBytes: 30720,
        dbBytesFreed: 4096,
        totalBytesFreed: 34816,
    })

    let renderer: any
    act(() => {
        renderer = create(<DatabaseSettings />)
    })

    const cleanupBtn = renderer.root
        .findAllByType('ThemedButton')
        .find((b: any) => b.props.label === 'Storage Cleanup & Optimize')
    expect(cleanupBtn).toBeDefined()

    await act(async () => {
        await cleanupBtn.props.onPress()
    })

    expect(scanOrphanedAvatars).toHaveBeenCalledTimes(1)
    const confirmAlert = jest.mocked(Alert.alert).mock.calls[0][0]
    expect(confirmAlert.title).toBe('Storage Cleanup & Optimize')
    expect(confirmAlert.buttons).toHaveLength(2)

    await act(async () => {
        await confirmAlert.buttons[1].onPress?.()
    })

    expect(cleanupOrphanedAvatarsAndVacuum).toHaveBeenCalledWith(mockOrphans)
    const doneAlert = jest.mocked(Alert.alert).mock.calls[1][0]
    expect(doneAlert.title).toBe('Storage Cleanup Complete')

    act(() => renderer.unmount())
})
