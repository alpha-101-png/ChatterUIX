import JSZip from 'jszip'

import { sqliteDB } from '../db/db'
import { resetDataMigrationFlags } from '../db/dataMigrations'
import {
    BACKUP_DB_ENTRY,
    BACKUP_MANIFEST_ENTRY,
    buildFullBackupZipBytes,
    isValidSqliteBytes,
    remapDocumentUri,
    remapRestoredDatabase,
    restoreFullBackup,
    sanitizeArchiveFilename,
    type BackupManifest,
} from '../lib/utils/backup'
import {
    copyFile,
    copyFileSync,
    deleteFile,
    makeDirectory,
    readFileBytes,
    writeCacheFile,
    writeFileBytes,
} from '../lib/utils/File'

const mockStagedDb = {
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
    withTransactionSync: jest.fn((fn: () => void) => fn()),
    execSync: jest.fn(),
    closeAsync: jest.fn(async () => {}),
}

jest.mock('i18next', () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
}))

jest.mock('expo-file-system', () => ({
    Paths: {
        document: { uri: 'file:///new-device/files/' },
        cache: { uri: 'file:///new-device/cache/' },
    },
}))

jest.mock('expo-sqlite', () => ({
    openDatabaseSync: jest.fn(() => mockStagedDb),
}))

jest.mock('../db/dataMigrations', () => ({
    resetDataMigrationFlags: jest.fn(),
}))

jest.mock('../db/db', () => ({
    db: {
        query: {
            characters: {
                findMany: jest.fn(async () => []),
            },
        },
    },
    sqliteDB: {
        execSync: jest.fn(),
        closeSync: jest.fn(),
        serializeAsync: jest.fn(async () => new Uint8Array()),
    },
}))

jest.mock('../lib/state/characters/images', () => ({
    getCardImageUri: (imageId: number) => `file:///new-device/files/characters/${imageId}.png`,
}))

jest.mock('../lib/utils/File', () => ({
    AppDirectory: {
        CharacterPath: 'file:///new-device/files/characters/',
    },
    copyFile: jest.fn(async () => true),
    copyFileSync: jest.fn(() => true),
    deleteFile: jest.fn(() => true),
    directoryExists: jest.fn(() => false),
    fileExists: jest.fn(() => false),
    listFiles: jest.fn(() => []),
    makeDirectory: jest.fn(async () => {}),
    readFileBytes: jest.fn(),
    shareOrSaveFile: jest.fn(async () => {}),
    writeCacheFile: jest.fn((filename: string) => `file:///new-device/cache/${filename}`),
    writeFileBytes: jest.fn(),
}))

beforeEach(() => {
    jest.clearAllMocks()
})

test('archive filename sanitization, SQLite header validation, and URI remapping handle edge cases', () => {
    expect(sanitizeArchiveFilename('../../evil.png')).toBe('evil.png')
    expect(sanitizeArchiveFilename('..')).toBe('')
    expect(sanitizeArchiveFilename('avatars/123.png')).toBe('123.png')

    const validHeader = new Uint8Array(32)
    const magic = 'SQLite format 3\0'
    for (let i = 0; i < magic.length; i++) validHeader[i] = magic.charCodeAt(i)
    expect(isValidSqliteBytes(validHeader)).toBe(true)
    expect(isValidSqliteBytes(new Uint8Array([1, 2, 3]))).toBe(false)

    expect(
        remapDocumentUri(
            'file:///old-device/Documents/attachments/img.png',
            'file:///new-device/files/',
            'file:///old-device/Documents/'
        )
    ).toBe('file:///new-device/files/attachments/img.png')

    expect(
        remapDocumentUri(
            'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/characters/77.png',
            'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/'
        )
    ).toBe('file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/characters/77.png')

    expect(remapDocumentUri('https://example.com/a.png', 'file:///new-device/files/')).toBe(
        'https://example.com/a.png'
    )
})

test('buildFullBackupZipBytes packs database/chatterui.db, avatars, and manifest.json', async () => {
    const dbBytes = new Uint8Array([83, 81, 76, 105, 116, 101])
    const avatarBytes = new Uint8Array([137, 80, 78, 71])
    const bgBytes = new Uint8Array([1, 2, 3, 4])
    const avatarFiles = new Map<string, Uint8Array>([
        ['101.png', avatarBytes],
        ['202.png', bgBytes],
    ])

    const zipBytes = await buildFullBackupZipBytes({
        appVersion: '0.8.8',
        dbBytes,
        characters: [{ id: 5, image_id: 101, background_image: 202 }],
        avatarFiles,
        documentUri: 'file:///device/files/',
    })

    const zip = await JSZip.loadAsync(zipBytes)
    expect(await zip.file(BACKUP_DB_ENTRY)!.async('uint8array')).toEqual(dbBytes)
    expect(await zip.file('avatars/101.png')!.async('uint8array')).toEqual(avatarBytes)
    expect(await zip.file('avatars/202.png')!.async('uint8array')).toEqual(bgBytes)

    const manifest = JSON.parse(
        await zip.file(BACKUP_MANIFEST_ENTRY)!.async('text')
    ) as BackupManifest
    expect(manifest.appVersion).toBe('0.8.8')
    expect(manifest.documentUri).toBe('file:///device/files/')
    expect(manifest.avatars).toEqual({ '5': '101.png' })
    expect(manifest.characters).toEqual({
        '5': {
            imageId: 101,
            avatar: '101.png',
            backgroundImageId: 202,
            background: '202.png',
        },
    })
})

const sqlite = process.getBuiltinModule?.('node:sqlite') as typeof import('node:sqlite') | undefined
const runIfSqlite = sqlite ? test : test.skip

runIfSqlite(
    'remapRestoredDatabase updates stored document URIs and manifest avatar IDs in SQLite',
    () => {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const connection = new sqlite!.DatabaseSync(':memory:', {
            enableDoubleQuotedStringLiterals: true,
        })
        const directory = path.join(__dirname, '../db/migrations')
        const journal = JSON.parse(
            fs.readFileSync(path.join(directory, 'meta/_journal.json'), 'utf8')
        )
        for (const { tag } of journal.entries) {
            connection.exec(fs.readFileSync(path.join(directory, `${tag}.sql`), 'utf8'))
        }

        connection
            .prepare(`INSERT INTO characters (id, type, name, image_id) VALUES (?, ?, ?, ?)`)
            .run(1, 'character', 'Alice', -1)
        connection
            .prepare(
                `INSERT INTO chats (id, create_date, character_id, name, scroll_offset) VALUES (?, ?, ?, ?, ?)`
            )
            .run(1, 0, 1, 'Chat', 0)
        connection
            .prepare(
                `INSERT INTO chat_entries (id, chat_id, is_user, name, "order", swipe_id) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(1, 1, 0, 'Alice', 0, 0)
        connection
            .prepare(
                `INSERT INTO chat_attachment (id, chat_entry_id, uri, type, mime_type, name, size) VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                1,
                1,
                'file:///old-install/files/attachments/photo.png',
                'image',
                'image/png',
                'photo.png',
                100
            )
        connection
            .prepare(
                `INSERT INTO model_data (id, file, name, file_path, file_size, params, quantization, context_length, architecture, create_date, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                1,
                'm.gguf',
                'M',
                'file:///old-install/files/models/m.gguf',
                100,
                '7B',
                'Q4',
                4096,
                'llama',
                0,
                0
            )

        const adapter = {
            getAllSync: <T>(source: string, params: (string | number | null)[] = []) =>
                connection.prepare(source).all(...params) as T[],
            runSync: (source: string, params: (string | number | null)[] = []) =>
                connection.prepare(source).run(...params),
            withTransactionSync: (task: () => void) => {
                connection.exec('BEGIN')
                try {
                    task()
                    connection.exec('COMMIT')
                } catch (err) {
                    connection.exec('ROLLBACK')
                    throw err
                }
            },
        }

        const extractedAvatars = new Set(['alice_custom.png'])
        const copiedPairs: [string, string][] = []

        remapRestoredDatabase(adapter, {
            targetDocumentUri: 'file:///new-install/files/',
            manifest: {
                documentUri: 'file:///old-install/files/',
                avatars: { '1': 'alice_custom.png' },
            },
            extractedAvatars,
            copyAvatar: (from, to) => {
                copiedPairs.push([from, to])
                return true
            },
        })

        const updatedChar = connection
            .prepare(`SELECT image_id FROM characters WHERE id = 1`)
            .get() as { image_id: number }
        expect(updatedChar.image_id).toBeGreaterThan(0)
        expect(copiedPairs).toEqual([['alice_custom.png', `${updatedChar.image_id}.png`]])

        const updatedAttachment = connection
            .prepare(`SELECT uri FROM chat_attachment WHERE id = 1`)
            .get() as { uri: string }
        expect(updatedAttachment.uri).toBe('file:///new-install/files/attachments/photo.png')

        const updatedModel = connection
            .prepare(`SELECT file_path FROM model_data WHERE id = 1`)
            .get() as { file_path: string }
        expect(updatedModel.file_path).toBe('file:///new-install/files/models/m.gguf')

        connection.close()
    }
)

test('restoreFullBackup validates archive, extracts avatars, replaces DB cleanly, and resets flags', async () => {
    const dbBytes = new Uint8Array(32)
    const magic = 'SQLite format 3\0'
    for (let i = 0; i < magic.length; i++) dbBytes[i] = magic.charCodeAt(i)
    const avatarBytes = new Uint8Array([137, 80, 78, 71])

    const zipBytes = await buildFullBackupZipBytes({
        appVersion: '0.8.8',
        dbBytes,
        characters: [{ id: 1, image_id: 55, background_image: null }],
        avatarFiles: new Map([['55.png', avatarBytes]]),
        documentUri: 'file:///old-device/files/',
    })

    jest.mocked(readFileBytes).mockResolvedValueOnce(zipBytes)
    const onBeforeReplaceDb = jest.fn(async () => {})

    await restoreFullBackup('file:///picked/backup.zip', { onBeforeReplaceDb })

    expect(makeDirectory).toHaveBeenCalledWith('file:///new-device/files/characters/')
    expect(writeFileBytes).toHaveBeenCalledWith(
        'file:///new-device/files/characters/55.png',
        avatarBytes
    )
    expect(writeCacheFile).toHaveBeenCalledWith(
        expect.stringMatching(/^chatterui-restore-\d+\.db$/),
        dbBytes
    )
    expect(onBeforeReplaceDb).toHaveBeenCalledTimes(1)
    expect(sqliteDB.closeSync).toHaveBeenCalledTimes(1)
    expect(deleteFile).toHaveBeenCalledWith('file:///new-device/files/SQLite/db.db')
    expect(deleteFile).toHaveBeenCalledWith('file:///new-device/files/SQLite/db.db-wal')
    expect(deleteFile).toHaveBeenCalledWith('file:///new-device/files/SQLite/db.db-shm')
    expect(copyFile).toHaveBeenCalledWith({
        from: expect.stringMatching(/^file:\/\/\/new-device\/cache\/chatterui-restore-\d+\.db$/),
        to: 'file:///new-device/files/SQLite/db.db',
    })
    expect(resetDataMigrationFlags).toHaveBeenCalledTimes(1)
})

test('restoreFullBackup rejects ZIP archives without a valid database/chatterui.db', async () => {
    const emptyZip = await new JSZip().generateAsync({ type: 'uint8array' })
    jest.mocked(readFileBytes).mockResolvedValueOnce(emptyZip)

    await expect(restoreFullBackup('file:///picked/invalid.zip')).rejects.toThrow(
        'database/chatterui.db'
    )
    expect(sqliteDB.closeSync).not.toHaveBeenCalled()
})
