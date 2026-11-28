import { db, sqliteDB } from '../db/db'
import { deleteFile, directoryExists, listFiles } from '../lib/utils/File'
import {
    cleanupOrphanedAvatarsAndVacuum,
    collectReferencedAvatarKeys,
    formatStorageSize,
    isImageFilename,
    scanOrphanedAvatars,
} from '../lib/utils/storageCleanup'

const mockDbRows: { image_id: number; background_image: number | null }[] = []
const mockFileSizes = new Map<string, number>()

jest.mock('expo-file-system', () => ({
    Paths: {
        document: { uri: 'file:///device/files/' },
        cache: { uri: 'file:///device/cache/' },
    },
}))

jest.mock('../db/db', () => ({
    db: {
        query: {
            characters: {
                findMany: jest.fn(async () => mockDbRows),
            },
        },
    },
    sqliteDB: {
        databasePath: '/device/files/SQLite/db.db',
        execAsync: jest.fn(async () => {}),
    },
}))

jest.mock('../lib/state/characters/images', () => ({
    getCardImageUri: (imageId: number) => `file:///device/files/characters/${imageId}.png`,
}))

jest.mock('../lib/utils/File', () => ({
    AppDirectory: {
        CharacterPath: 'file:///device/files/characters/',
    },
    directoryExists: jest.fn(() => true),
    listFiles: jest.fn(() => []),
    fileInfo: jest.fn((uri: string) => {
        const size = mockFileSizes.get(uri)
        return size !== undefined ? { exists: true, size } : { exists: false }
    }),
    deleteFile: jest.fn((uri: string) => {
        const existed = mockFileSizes.has(uri)
        mockFileSizes.delete(uri)
        return existed
    }),
}))

beforeEach(() => {
    jest.clearAllMocks()
    mockDbRows.length = 0
    mockFileSizes.clear()
})

test('formatStorageSize formats bytes in KB and MB cleanly', () => {
    expect(formatStorageSize(0)).toBe('0 KB')
    expect(formatStorageSize(512)).toBe('0.50 KB')
    expect(formatStorageSize(25 * 1024)).toBe('25.0 KB')
    expect(formatStorageSize(2.5 * 1024 * 1024)).toBe('2.50 MB')
})

test('isImageFilename recognizes common image formats case-insensitively', () => {
    expect(isImageFilename('123.png')).toBe(true)
    expect(isImageFilename('avatar.JPEG')).toBe(true)
    expect(isImageFilename('photo.webp')).toBe(true)
    expect(isImageFilename('notes.txt')).toBe(false)
    expect(isImageFilename('README')).toBe(false)
})

test('collectReferencedAvatarKeys collects character avatars, backgrounds, and user persona avatars', () => {
    const keys = collectReferencedAvatarKeys([
        { image_id: 101, background_image: 202 },
        { image_id: 303, background_image: null },
        { image_id: -1, background_image: null },
    ])

    expect(Array.from(keys.filenames).sort()).toEqual(['101.png', '202.png', '303.png'])
    expect(keys.uris.has('file:///device/files/characters/101.png')).toBe(true)
    expect(keys.uris.has('file:///device/files/characters/202.png')).toBe(true)
    expect(keys.uris.has('file:///device/files/characters/303.png')).toBe(true)
})

test('scanOrphanedAvatars ignores active character/user avatars and backgrounds and finds orphans', async () => {
    mockDbRows.push(
        { image_id: 1001, background_image: 1002 }, // active character + background
        { image_id: 2001, background_image: null } // active user persona
    )
    jest.mocked(directoryExists).mockReturnValueOnce(true)
    jest.mocked(listFiles).mockReturnValueOnce([
        '1001.png',
        '1002.png',
        '2001.png',
        '9991.png',
        '9992.jpg',
        '.DS_Store',
    ])
    mockFileSizes.set('file:///device/files/characters/1001.png', 5000)
    mockFileSizes.set('file:///device/files/characters/1002.png', 6000)
    mockFileSizes.set('file:///device/files/characters/2001.png', 4000)
    mockFileSizes.set('file:///device/files/characters/9991.png', 1500)
    mockFileSizes.set('file:///device/files/characters/9992.jpg', 2500)

    const result = await scanOrphanedAvatars()

    expect(db.query.characters.findMany).toHaveBeenCalledTimes(1)
    expect(result.files).toEqual([
        { filename: '9991.png', uri: 'file:///device/files/characters/9991.png', size: 1500 },
        { filename: '9992.jpg', uri: 'file:///device/files/characters/9992.jpg', size: 2500 },
    ])
    expect(result.totalBytes).toBe(4000)
})

test('cleanupOrphanedAvatarsAndVacuum deletes orphans, runs VACUUM, and reports space freed', async () => {
    const orphanUri = 'file:///device/files/characters/9991.png'
    const dbUri = 'file:///device/files/SQLite/db.db'
    mockFileSizes.set(orphanUri, 12000)
    mockFileSizes.set(dbUri, 100000)
    mockFileSizes.set(`${dbUri}-wal`, 8000)

    jest.mocked(sqliteDB.execAsync).mockImplementationOnce(async () => {
        // Simulate VACUUM shrinking db.db
        mockFileSizes.set(dbUri, 70000)
    })
    jest.mocked(sqliteDB.execAsync).mockImplementationOnce(async () => {
        // Simulate wal checkpoint truncating WAL
        mockFileSizes.set(`${dbUri}-wal`, 0)
    })

    const result = await cleanupOrphanedAvatarsAndVacuum([
        { filename: '9991.png', uri: orphanUri, size: 12000 },
    ])

    expect(deleteFile).toHaveBeenCalledWith(orphanUri)
    expect(sqliteDB.execAsync).toHaveBeenNthCalledWith(1, 'VACUUM;')
    expect(sqliteDB.execAsync).toHaveBeenNthCalledWith(2, 'PRAGMA wal_checkpoint(TRUNCATE);')
    expect(result).toEqual({
        deletedCount: 1,
        deletedBytes: 12000,
        dbBytesFreed: 38000,
        totalBytesFreed: 50000,
    })
})
