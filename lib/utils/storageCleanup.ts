import { Paths } from 'expo-file-system'

import { db, sqliteDB } from '@db/db'
import { getCardImageUri } from '@lib/state/characters/images'
import { AppDirectory, deleteFile, directoryExists, fileInfo, listFiles } from '@lib/utils/File'

const IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.bmp',
    '.heic',
    '.heif',
    '.avif',
])

export type OrphanedAvatarFile = {
    filename: string
    uri: string
    size: number
}

export type OrphanedAvatarScanResult = {
    files: OrphanedAvatarFile[]
    totalBytes: number
}

export type StorageCleanupResult = {
    deletedCount: number
    deletedBytes: number
    dbBytesFreed: number
    totalBytesFreed: number
}

export type CharacterImageReferenceRow = {
    image_id: number
    background_image: number | null
}

const ensureTrailingSlash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`)

export const isImageFilename = (filename: string): boolean => {
    const dotIndex = filename.lastIndexOf('.')
    if (dotIndex === -1) return false
    return IMAGE_EXTENSIONS.has(filename.slice(dotIndex).toLowerCase())
}

export const formatStorageSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
    const megabyte = 1024 * 1024
    if (bytes < megabyte) {
        const kb = bytes / 1024
        return `${kb < 10 ? kb.toFixed(2) : kb.toFixed(1)} KB`
    }
    return `${(bytes / megabyte).toFixed(2)} MB`
}

export const collectReferencedAvatarKeys = (rows: CharacterImageReferenceRow[]) => {
    const filenames = new Set<string>()
    const uris = new Set<string>()

    for (const row of rows) {
        if (typeof row.image_id === 'number' && row.image_id >= 0) {
            filenames.add(`${row.image_id}.png`)
            uris.add(getCardImageUri(row.image_id))
        }
        if (
            row.background_image !== null &&
            typeof row.background_image === 'number' &&
            row.background_image >= 0
        ) {
            filenames.add(`${row.background_image}.png`)
            uris.add(getCardImageUri(row.background_image))
        }
    }

    return { filenames, uris }
}

export const scanOrphanedAvatars = async (): Promise<OrphanedAvatarScanResult> => {
    const avatarDir = ensureTrailingSlash(AppDirectory.CharacterPath)
    if (!directoryExists(avatarDir)) {
        return { files: [], totalBytes: 0 }
    }

    // `characters` stores both character cards (`type = 'character'`) and user personas (`type = 'user'`).
    const characterRows = await db.query.characters.findMany({
        columns: {
            image_id: true,
            background_image: true,
        },
    })
    const referenced = collectReferencedAvatarKeys(characterRows)

    const files: OrphanedAvatarFile[] = []
    let totalBytes = 0

    for (const filename of listFiles(avatarDir)) {
        if (!isImageFilename(filename)) continue
        const uri = `${avatarDir}${filename}`
        if (referenced.filenames.has(filename) || referenced.uris.has(uri)) continue

        const info = fileInfo(uri)
        const size = info.exists && typeof info.size === 'number' ? info.size : 0
        files.push({ filename, uri, size })
        totalBytes += size
    }

    return { files, totalBytes }
}

const resolveSqliteDatabaseUri = () => {
    const defaultUri = `${ensureTrailingSlash(Paths.document.uri)}SQLite/db.db`
    if (fileInfo(defaultUri).exists) return defaultUri

    const dbPath = sqliteDB.databasePath
    if (dbPath && dbPath !== ':memory:') {
        return dbPath.startsWith('file://') ? dbPath : `file://${dbPath}`
    }
    return defaultUri
}

const getDatabaseDiskSize = (dbUri: string): number => {
    let total = 0
    for (const candidate of [dbUri, `${dbUri}-wal`, `${dbUri}-shm`]) {
        const info = fileInfo(candidate)
        if (info.exists && typeof info.size === 'number') {
            total += info.size
        }
    }
    return total
}

export const cleanupOrphanedAvatarsAndVacuum = async (
    orphanedFiles: OrphanedAvatarFile[]
): Promise<StorageCleanupResult> => {
    let deletedCount = 0
    let deletedBytes = 0

    for (const file of orphanedFiles) {
        if (deleteFile(file.uri)) {
            deletedCount++
            deletedBytes += file.size
        }
    }

    const dbUri = resolveSqliteDatabaseUri()
    const dbSizeBefore = getDatabaseDiskSize(dbUri)

    await sqliteDB.execAsync('VACUUM;')
    try {
        await sqliteDB.execAsync('PRAGMA wal_checkpoint(TRUNCATE);')
    } catch {
        // Ignore if database is not in WAL mode.
    }

    const dbSizeAfter = getDatabaseDiskSize(dbUri)
    const dbBytesFreed = Math.max(0, dbSizeBefore - dbSizeAfter)

    return {
        deletedCount,
        deletedBytes,
        dbBytesFreed,
        totalBytesFreed: deletedBytes + dbBytesFreed,
    }
}
