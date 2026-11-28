import { db as database } from '../db/db'
import { db } from '../lib/state/characters/db'
import { buildBlankCharacterCard } from '../lib/state/characters/schema'

jest.mock('../lib/state/Logger', () => ({ Logger: { warn: jest.fn(), errorToast: jest.fn() } }))
jest.mock('../lib/state/chat/access', () => ({ assertChatEditable: jest.fn() }))

jest.mock('../db/db', () => {
    const { drizzle } = require('drizzle-orm/expo-sqlite')
    const fs = require('fs')
    const path = require('path')
    const schema = require('../db/schema')
    const sqlite = process.getBuiltinModule?.('node:sqlite') as
        typeof import('node:sqlite') | undefined
    let connection = sqlite
        ? new sqlite.DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true })
        : undefined
    if (connection && typeof connection.prepare('SELECT 1').setReturnArrays !== 'function') {
        connection.close()
        connection = undefined
    }
    if (connection) {
        const directory = path.join(__dirname, '../db/migrations')
        const journal = JSON.parse(
            fs.readFileSync(path.join(directory, 'meta/_journal.json'), 'utf8')
        )
        for (const { tag } of journal.entries)
            connection.exec(fs.readFileSync(path.join(directory, `${tag}.sql`), 'utf8'))
        connection.exec('PRAGMA foreign_keys = ON')
    }
    const client = {
        prepareSync: (sql: string) => {
            if (!connection) throw new Error('Node SQLite is unavailable')
            const statement = connection.prepare(sql)
            const execute = (params: import('node:sqlite').SQLInputValue[]) => {
                if (statement.columns().length) {
                    statement.setReturnArrays(true)
                    const rows = statement.all(...params)
                    return { getAllSync: () => rows, getFirstSync: () => rows[0] }
                }
                const result = statement.run(...params)
                return {
                    changes: result.changes,
                    lastInsertRowId: result.lastInsertRowid,
                    getAllSync: () => [],
                }
            }
            return { executeSync: execute, executeForRawResultSync: execute }
        },
        execSync: (sql: string) => {
            if (!connection) throw new Error('Node SQLite is unavailable')
            connection.exec(sql)
        },
    }
    return {
        db: drizzle(client, { schema }),
        connection: connection,
        reset: () => {
            connection?.exec(
                'DELETE FROM character_folder_members; DELETE FROM character_folders; DELETE FROM characters;'
            )
        },
    }
})

const { connection, reset } = require('../db/db') as {
    connection?: import('node:sqlite').DatabaseSync
    reset: () => void
}

const runIfSqlite = connection ? test : test.skip

beforeEach(() => {
    reset()
})

runIfSqlite(
    'creating and importing characters inside a folder assigns membership while root and ungrouped stay unassigned',
    async () => {
        const folderId = await db.folders.create('Sci-Fi')

        const createdInFolder = await db.create.blankCard('Nova', { folderId })
        const importedInFolder = await db.create.card(buildBlankCharacterCard('Orion'), {
            folderId,
        })
        const createdAtRoot = await db.create.blankCard('RootChar')
        const createdInUngrouped = await db.create.blankCard('UngroupedChar', { folderId: null })
        const importedAtRoot = await db.create.card(buildBlankCharacterCard('RootImport'))
        const createdMissingFolder = await db.create.blankCard('MissingFolderChar', {
            folderId: 999999,
        })

        expect((await db.folders.membershipOf(createdInFolder))?.folder_id).toBe(folderId)
        expect((await db.folders.membershipOf(importedInFolder!.id))?.folder_id).toBe(folderId)
        expect(await db.folders.membershipOf(createdAtRoot)).toBeUndefined()
        expect(await db.folders.membershipOf(createdInUngrouped)).toBeUndefined()
        expect(await db.folders.membershipOf(importedAtRoot!.id)).toBeUndefined()
        expect(await db.folders.membershipOf(createdMissingFolder)).toBeUndefined()

        const [{ count }] = await db.folders.ungroupedCount()
        expect(count).toBe(4)
    }
)

runIfSqlite(
    'pinned folders sort before unpinned folders alphabetically and deleting returns members to ungrouped',
    async () => {
        const zetaId = await db.folders.create('Zeta')
        const alphaId = await db.folders.create('Alpha')
        const betaId = await db.folders.create('Beta')

        expect((await db.folders.list()).map((f) => f.name)).toEqual(['Alpha', 'Beta', 'Zeta'])
        expect((await db.folders.liveList()).map((f) => f.name)).toEqual(['Alpha', 'Beta', 'Zeta'])

        await db.folders.setPinned(zetaId, true)
        expect((await db.folders.liveList()).map((f) => [f.name, f.isPinned])).toEqual([
            ['Zeta', true],
            ['Alpha', false],
            ['Beta', false],
        ])

        await db.folders.setPinned(betaId, true)
        expect((await db.folders.list()).map((f) => [f.name, f.isPinned])).toEqual([
            ['Beta', true],
            ['Zeta', true],
            ['Alpha', false],
        ])

        await db.folders.setPinned(betaId, false)
        await db.folders.rename(zetaId, 'Gamma')
        expect((await db.folders.liveList()).map((f) => [f.name, f.isPinned])).toEqual([
            ['Gamma', true],
            ['Alpha', false],
            ['Beta', false],
        ])

        const memberId = await db.create.blankCard('Member', { folderId: alphaId })
        expect((await db.folders.ungroupedCount())[0].count).toBe(0)

        await db.folders.remove(alphaId)
        expect(await db.folders.membershipOf(memberId)).toBeUndefined()
        expect((await db.folders.ungroupedCount())[0].count).toBe(1)
        expect(await database.query.characters.findFirst()).toBeDefined()
    }
)

runIfSqlite(
    'global cardListWindow search matches characters across all folders and includes folder names',
    async () => {
        const sciFiId = await db.folders.create('Sci-Fi')
        const fantasyId = await db.folders.create('Fantasy')

        await db.create.blankCard('Alice Alpha', { folderId: sciFiId })
        await db.create.blankCard('Alice Beta', { folderId: fantasyId })
        await db.create.blankCard('Alice Ungrouped')
        await db.create.blankCard('Bob Excluded', { folderId: sciFiId })

        const results = await db.live.cardListWindow({
            type: 'character',
            searchText: 'Alice',
            folderId: undefined,
            limit: 30,
            offset: 0,
        })

        expect(results).toHaveLength(3)
        expect(
            results.map((r) => ({
                name: r.name,
                folderId: r.folder_membership?.folder_id ?? null,
                folderName: r.folder_membership?.folder?.name ?? null,
            }))
        ).toEqual(
            expect.arrayContaining([
                { name: 'Alice Alpha', folderId: sciFiId, folderName: 'Sci-Fi' },
                { name: 'Alice Beta', folderId: fantasyId, folderName: 'Fantasy' },
                { name: 'Alice Ungrouped', folderId: null, folderName: null },
            ])
        )
    }
)
