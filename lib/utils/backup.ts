import { Paths } from 'expo-file-system'
import { openDatabaseSync } from 'expo-sqlite'
import { t } from 'i18next'
import JSZip from 'jszip'

import { resetDataMigrationFlags } from '@db/dataMigrations'
import { db, sqliteDB } from '@db/db'
import { getCardImageUri } from '@lib/state/characters/images'
import {
    AppDirectory,
    copyFile,
    copyFileSync,
    deleteFile,
    directoryExists,
    fileExists,
    listFiles,
    makeDirectory,
    readFileBytes,
    shareOrSaveFile,
    writeCacheFile,
    writeFileBytes,
} from '@lib/utils/File'

export const BACKUP_DB_ENTRY = 'database/chatterui.db'
export const BACKUP_AVATARS_DIR = 'avatars/'
export const BACKUP_MANIFEST_ENTRY = 'manifest.json'

const SQLITE_HEADER = 'SQLite format 3\0'
const DOCUMENT_SUBDIRECTORIES = [
    '/characters/',
    '/attachments/',
    '/appAssets/',
    '/models/',
    '/session/',
]

export type BackupCharacterManifestEntry = {
    imageId: number
    avatar?: string
    backgroundImageId?: number | null
    background?: string
}

export type BackupManifest = {
    version: number
    appVersion: string
    createdAt: string
    documentUri?: string
    avatars: Record<string, string>
    characters?: Record<string, BackupCharacterManifestEntry>
}

export type BackupCharacterRow = {
    id: number
    image_id: number
    background_image: number | null
}

export type SqliteSyncAdapter = {
    getAllSync: <T>(source: string, params: (string | number | null)[]) => T[]
    runSync: (source: string, params: (string | number | null)[]) => unknown
    withTransactionSync: (task: () => void) => void
}

const ensureTrailingSlash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`)

export const sanitizeArchiveFilename = (name: string) => {
    const normalized = name.replace(/\\/g, '/')
    const base = normalized.slice(normalized.lastIndexOf('/') + 1).trim()
    if (!base || base === '.' || base === '..') return ''
    return base
}

export const isValidSqliteBytes = (bytes: Uint8Array) => {
    if (bytes.length < SQLITE_HEADER.length) return false
    for (let i = 0; i < SQLITE_HEADER.length; i++) {
        if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false
    }
    return true
}

export const remapDocumentUri = (
    uri: string,
    targetDocumentUri: string,
    sourceDocumentUri?: string
) => {
    if (!uri) return uri
    const target = ensureTrailingSlash(targetDocumentUri)
    if (sourceDocumentUri) {
        const source = ensureTrailingSlash(sourceDocumentUri)
        if (uri.startsWith(source)) {
            return target + uri.slice(source.length)
        }
    }
    if (uri.startsWith('file://') || uri.startsWith('/')) {
        for (const subdir of DOCUMENT_SUBDIRECTORIES) {
            const idx = uri.indexOf(subdir)
            if (idx !== -1) {
                return target + uri.slice(idx + 1)
            }
        }
    }
    return uri
}

export const buildFullBackupZipBytes = async ({
    appVersion,
    dbBytes,
    characters,
    avatarFiles,
    documentUri,
}: {
    appVersion: string
    dbBytes: Uint8Array
    characters: BackupCharacterRow[]
    avatarFiles: Map<string, Uint8Array>
    documentUri: string
}): Promise<Uint8Array> => {
    const zip = new JSZip()
    zip.file(BACKUP_DB_ENTRY, dbBytes)

    const avatarsManifest: Record<string, string> = {}
    const charactersManifest: Record<string, BackupCharacterManifestEntry> = {}

    for (const character of characters) {
        const entry: BackupCharacterManifestEntry = { imageId: character.image_id }
        const avatarFilename = `${character.image_id}.png`
        if (character.image_id >= 0 && avatarFiles.has(avatarFilename)) {
            avatarsManifest[String(character.id)] = avatarFilename
            entry.avatar = avatarFilename
        }
        if (character.background_image !== null && character.background_image >= 0) {
            const bgFilename = `${character.background_image}.png`
            if (avatarFiles.has(bgFilename)) {
                entry.backgroundImageId = character.background_image
                entry.background = bgFilename
            }
        }
        charactersManifest[String(character.id)] = entry
    }

    for (const [filename, bytes] of avatarFiles) {
        const safe = sanitizeArchiveFilename(filename)
        if (safe) {
            zip.file(`${BACKUP_AVATARS_DIR}${safe}`, bytes)
        }
    }

    const manifest: BackupManifest = {
        version: 1,
        appVersion: appVersion,
        createdAt: new Date().toISOString(),
        documentUri: documentUri,
        avatars: avatarsManifest,
        characters: charactersManifest,
    }
    zip.file(BACKUP_MANIFEST_ENTRY, JSON.stringify(manifest, null, 2))

    return await zip.generateAsync({ type: 'uint8array' })
}

const remapImageReference = ({
    currentImageId,
    manifestFilename,
    extractedAvatars,
    usedImageIds,
    copyAvatar,
}: {
    currentImageId: number | null
    manifestFilename: string | undefined
    extractedAvatars: Set<string>
    usedImageIds: Set<number>
    copyAvatar: (fromFilename: string, toFilename: string) => boolean
}): number | null => {
    if (!manifestFilename) return currentImageId
    const safeFilename = sanitizeArchiveFilename(manifestFilename)
    if (!safeFilename || !extractedAvatars.has(safeFilename)) return currentImageId

    if (currentImageId !== null && currentImageId >= 0 && `${currentImageId}.png` === safeFilename) {
        return currentImageId
    }

    const numericMatch = /^(\d+)\.png$/i.exec(safeFilename)
    if (numericMatch) {
        const parsedId = Number(numericMatch[1])
        usedImageIds.add(parsedId)
        return parsedId
    }

    let candidateId = Date.now()
    while (usedImageIds.has(candidateId) || extractedAvatars.has(`${candidateId}.png`)) {
        candidateId++
    }
    const targetFilename = `${candidateId}.png`
    if (!copyAvatar(safeFilename, targetFilename)) {
        return currentImageId
    }
    extractedAvatars.add(targetFilename)
    usedImageIds.add(candidateId)
    return candidateId
}

export const remapRestoredDatabase = (
    adapter: SqliteSyncAdapter,
    {
        targetDocumentUri,
        manifest,
        extractedAvatars,
        copyAvatar,
    }: {
        targetDocumentUri: string
        manifest?: Partial<BackupManifest>
        extractedAvatars: Set<string>
        copyAvatar: (fromFilename: string, toFilename: string) => boolean
    }
) => {
    const tables = new Set(
        adapter
            .getAllSync<{ name: string }>(
                `SELECT name FROM sqlite_master WHERE type = 'table'`,
                []
            )
            .map((row) => row.name)
    )

    const sourceDocUri = manifest?.documentUri

    adapter.withTransactionSync(() => {
        if (tables.has('characters')) {
            const characterRows = adapter.getAllSync<{
                id: number
                image_id: number
                background_image: number | null
            }>(`SELECT id, image_id, background_image FROM characters`, [])

            const usedImageIds = new Set<number>()
            for (const row of characterRows) {
                if (row.image_id >= 0) usedImageIds.add(row.image_id)
                if (row.background_image !== null && row.background_image >= 0) {
                    usedImageIds.add(row.background_image)
                }
            }

            for (const row of characterRows) {
                const key = String(row.id)
                const manifestAvatar =
                    manifest?.avatars?.[key] ?? manifest?.characters?.[key]?.avatar
                const nextImageId = remapImageReference({
                    currentImageId: row.image_id,
                    manifestFilename: manifestAvatar,
                    extractedAvatars,
                    usedImageIds,
                    copyAvatar,
                })
                if (nextImageId !== null && nextImageId !== row.image_id) {
                    adapter.runSync(`UPDATE characters SET image_id = ? WHERE id = ?`, [
                        nextImageId,
                        row.id,
                    ])
                }

                const manifestBackground = manifest?.characters?.[key]?.background
                const nextBgId = remapImageReference({
                    currentImageId: row.background_image,
                    manifestFilename: manifestBackground,
                    extractedAvatars,
                    usedImageIds,
                    copyAvatar,
                })
                if (nextBgId !== row.background_image) {
                    adapter.runSync(`UPDATE characters SET background_image = ? WHERE id = ?`, [
                        nextBgId,
                        row.id,
                    ])
                }
            }

            // Remap any text columns on characters that store file URIs (e.g., custom/legacy schemas)
            const columns = adapter
                .getAllSync<{ name: string; type: string }>(`PRAGMA table_info("characters")`, [])
                .filter((col) => /char|text|clob/i.test(col.type) && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name))

            for (const col of columns) {
                const uriRows = adapter.getAllSync<{ id: number; value: string | null }>(
                    `SELECT id, "${col.name}" AS value FROM characters WHERE "${col.name}" LIKE 'file://%' OR "${col.name}" LIKE '/%'`,
                    []
                )
                for (const uriRow of uriRows) {
                    if (!uriRow.value) continue
                    const remapped = remapDocumentUri(uriRow.value, targetDocumentUri, sourceDocUri)
                    if (remapped !== uriRow.value) {
                        adapter.runSync(
                            `UPDATE characters SET "${col.name}" = ? WHERE id = ?`,
                            [remapped, uriRow.id]
                        )
                    }
                }
            }
        }

        if (tables.has('chat_attachment')) {
            const attachmentRows = adapter.getAllSync<{ id: number; uri: string }>(
                `SELECT id, uri FROM chat_attachment`,
                []
            )
            for (const row of attachmentRows) {
                const remapped = remapDocumentUri(row.uri, targetDocumentUri, sourceDocUri)
                if (remapped !== row.uri) {
                    adapter.runSync(`UPDATE chat_attachment SET uri = ? WHERE id = ?`, [
                        remapped,
                        row.id,
                    ])
                }
            }
        }

        if (tables.has('model_data')) {
            const modelRows = adapter.getAllSync<{ id: number; file_path: string }>(
                `SELECT id, file_path FROM model_data`,
                []
            )
            for (const row of modelRows) {
                const remapped = remapDocumentUri(row.file_path, targetDocumentUri, sourceDocUri)
                if (remapped !== row.file_path) {
                    adapter.runSync(`UPDATE model_data SET file_path = ? WHERE id = ?`, [
                        remapped,
                        row.id,
                    ])
                }
            }
        }
    })
}

export const exportFullBackup = async (appVersion: string) => {
    try {
        sqliteDB.execSync('PRAGMA wal_checkpoint(TRUNCATE);')
    } catch {
        // Ignore if database is not in WAL mode.
    }

    const dbUri = `${Paths.document.uri}SQLite/db.db`
    const dbBytes = fileExists(dbUri)
        ? await readFileBytes(dbUri)
        : await sqliteDB.serializeAsync()

    const characterRows = await db.query.characters.findMany({
        columns: {
            id: true,
            image_id: true,
            background_image: true,
        },
    })

    const avatarFiles = new Map<string, Uint8Array>()

    for (const character of characterRows) {
        if (character.image_id >= 0) {
            const filename = `${character.image_id}.png`
            const uri = getCardImageUri(character.image_id)
            if (!avatarFiles.has(filename) && fileExists(uri)) {
                avatarFiles.set(filename, await readFileBytes(uri))
            }
        }
        if (character.background_image !== null && character.background_image >= 0) {
            const bgFilename = `${character.background_image}.png`
            const bgUri = getCardImageUri(character.background_image)
            if (!avatarFiles.has(bgFilename) && fileExists(bgUri)) {
                avatarFiles.set(bgFilename, await readFileBytes(bgUri))
            }
        }
    }

    if (directoryExists(AppDirectory.CharacterPath)) {
        for (const filename of listFiles(AppDirectory.CharacterPath)) {
            if (!avatarFiles.has(filename)) {
                avatarFiles.set(
                    filename,
                    await readFileBytes(`${AppDirectory.CharacterPath}${filename}`)
                )
            }
        }
    }

    const zipBytes = await buildFullBackupZipBytes({
        appVersion,
        dbBytes,
        characters: characterRows,
        avatarFiles,
        documentUri: Paths.document.uri,
    })

    const archiveName = `chatterui-backup-${appVersion}-${Date.now()}.zip`
    const archiveUri = writeCacheFile(archiveName, zipBytes)
    await shareOrSaveFile(archiveUri, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: archiveName,
    })
}

export const restoreFullBackup = async (
    zipUri: string,
    options?: { onBeforeReplaceDb?: () => Promise<void> }
) => {
    const archiveBytes = await readFileBytes(zipUri)
    const zip = await JSZip.loadAsync(archiveBytes)

    const dbEntry = zip.file(BACKUP_DB_ENTRY)
    if (!dbEntry) {
        throw new Error(
            t(
                'settings.database.fullBackup.errors.missingDatabase',
                'Invalid backup archive: database/chatterui.db not found'
            )
        )
    }

    const dbBytes = await dbEntry.async('uint8array')
    if (!isValidSqliteBytes(dbBytes)) {
        throw new Error(
            t(
                'settings.database.fullBackup.errors.invalidDatabase',
                'Invalid backup archive: corrupted SQLite database'
            )
        )
    }

    let manifest: Partial<BackupManifest> | undefined
    const manifestEntry = zip.file(BACKUP_MANIFEST_ENTRY)
    if (manifestEntry) {
        try {
            manifest = JSON.parse(await manifestEntry.async('text')) as Partial<BackupManifest>
        } catch {
            manifest = undefined
        }
    }

    await makeDirectory(AppDirectory.CharacterPath)
    const extractedAvatars = new Set<string>()
    const avatarEntries = Object.values(zip.files).filter(
        (entry) => !entry.dir && entry.name.startsWith(BACKUP_AVATARS_DIR)
    )
    for (const entry of avatarEntries) {
        const filename = sanitizeArchiveFilename(entry.name.slice(BACKUP_AVATARS_DIR.length))
        if (!filename) continue
        const bytes = await entry.async('uint8array')
        writeFileBytes(`${AppDirectory.CharacterPath}${filename}`, bytes)
        extractedAvatars.add(filename)
    }

    const stagedName = `chatterui-restore-${Date.now()}.db`
    const stagedUri = writeCacheFile(stagedName, dbBytes)
    try {
        const stagedDb = openDatabaseSync(stagedName, undefined, Paths.cache.uri)
        try {
            remapRestoredDatabase(stagedDb, {
                targetDocumentUri: Paths.document.uri,
                manifest,
                extractedAvatars,
                copyAvatar: (fromFilename, toFilename) =>
                    copyFileSync({
                        from: `${AppDirectory.CharacterPath}${fromFilename}`,
                        to: `${AppDirectory.CharacterPath}${toFilename}`,
                    }),
            })
            try {
                stagedDb.execSync('PRAGMA wal_checkpoint(TRUNCATE);')
            } catch {
                // Ignore if not in WAL mode.
            }
        } finally {
            await stagedDb.closeAsync()
        }
        deleteFile(`${Paths.cache.uri}${stagedName}-wal`)
        deleteFile(`${Paths.cache.uri}${stagedName}-shm`)

        await options?.onBeforeReplaceDb?.()

        const sqliteDir = `${Paths.document.uri}SQLite/`
        await makeDirectory(sqliteDir)
        try {
            sqliteDB.closeSync()
        } catch {
            // Ignore if already closed.
        }
        const targetDbUri = `${sqliteDir}db.db`
        deleteFile(targetDbUri)
        deleteFile(`${targetDbUri}-wal`)
        deleteFile(`${targetDbUri}-shm`)
        const copied = await copyFile({ from: stagedUri, to: targetDbUri })
        if (!copied) {
            throw new Error('Failed to copy restored database into SQLite directory')
        }
        resetDataMigrationFlags()
    } finally {
        deleteFile(stagedUri)
        deleteFile(`${stagedUri}-wal`)
        deleteFile(`${stagedUri}-shm`)
    }
}
