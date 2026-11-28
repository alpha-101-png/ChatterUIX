import React, { act } from 'react'

import { useContextStatsState } from '../lib/engine/generation/contextStatsState'
import { useContextAllocation } from '../lib/hooks/ContextAllocation'

jest.mock('../lib/engine/API/ContextBuilder', () => ({
    getSystemPrompt: () => ({ components: [{ key: 'system_prompt', tokens: 5 }] }),
}))
jest.mock('../lib/engine/API/connectionStore', () => ({ useActiveConnectionTemplate: () => ({}) }))
jest.mock('react-native-mmkv', () => ({ useMMKVBoolean: () => [false] }))
jest.mock('../lib/hooks/ContextLimit', () => ({ useContextLimit: () => 200 }))
jest.mock('../lib/hooks/liveQuery', () => ({
    useLiveQuerySync: (query: { source: string }) => ({ data: mockData[query.source] }),
}))
jest.mock('../lib/queries/contextAllocation', () => ({
    contextHistory: () => ({ source: 'history' }),
    contextAuthorNotes: () => ({ source: 'notes' }),
    contextLorebooks: () => ({ source: 'books' }),
}))
jest.mock('../lib/summaries/db', () => ({ summaryList: () => ({ source: 'summaries' }) }))
let mockSummarySettings = { enabled: true, summaryRetainCount: 0 }
jest.mock('../lib/summaries/settingsStore', () => ({
    useSummarySettingsStore: (select: any) => select(mockSummarySettings),
}))
jest.mock('../lib/state/AppMode', () => ({ useAppMode: () => ({ appMode: 'remote' }) }))
jest.mock('../lib/state/characters', () => ({
    Characters: {
        useCharacterState: (select: any) => select({}),
        useUserStore: (select: any) => select({}),
    },
}))
jest.mock('../lib/state/chat', () => ({
    Chats: { useChatState: (select: any) => select({ id: 1 }) },
}))
jest.mock('../lib/state/Instructs', () => ({
    Instructs: {
        useInstruct: (select: any) => select({}),
        defaultInstruct: { system_prompt_format: '{{system_prompt}}', system_prompt: 'test' },
    },
}))
jest.mock('../lib/state/samplerStore', () => ({
    useCurrentSampler: () => ({ data: { genamt: 20 } }),
}))
const { create } = require('react-test-renderer')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let mockData: Record<string, any[]>
beforeEach(() => {
    mockSummarySettings = { enabled: true, summaryRetainCount: 0 }
    mockData = {
        history: [
            {
                id: 1,
                token_length: 100,
                content_length: 400,
                has_content: 1,
                is_user: true,
                reasoning_length: 0,
            },
        ],
        notes: [],
        books: [],
        summaries: [],
    }
    useContextStatsState.setState({ chats: {}, lastChatId: undefined })
})

test('current history keeps updating after a previous prompt exists', async () => {
    useContextStatsState.setState({ chats: { 1: { total: 1 } as any } })
    let result: ReturnType<typeof useContextAllocation>
    const Consumer = ({ response }: { response: number }) => {
        const value = useContextAllocation(response)
        React.useEffect(() => {
            result = value
        }, [value])
        return null
    }
    let screen: ReturnType<typeof create>
    await act(async () => {
        screen = create(<Consumer response={20} />)
    })
    expect(result!.used).toBe(105)
    expect(result!.free).toBe(75)
    mockData.history.push({
        id: 2,
        token_length: 50,
        content_length: 200,
        has_content: 1,
        is_user: false,
        reasoning_length: 0,
    })
    await act(async () => screen.update(<Consumer response={30} />))
    expect(result!.summarySavings).toBe(0)
    expect(result!.values.history).toBe(150)
    expect(result!.reserved).toBe(30)
    expect(result!.free).toBe(15)
    await act(async () => screen.unmount())
})

test('author-note reservations are live while lorebook limits remain opportunistic', async () => {
    mockData.notes = [{ chat_id: 1, character_id: null, content: 'note', token_length: 10 }]
    mockData.books = [{ name: 'Lore', token_budget: 500 }]
    let result: ReturnType<typeof useContextAllocation>
    const Consumer = () => {
        const value = useContextAllocation()
        React.useEffect(() => {
            result = value
        }, [value])
        return null
    }
    let screen: ReturnType<typeof create>
    await act(async () => {
        screen = create(<Consumer />)
    })
    expect(result!.reserved).toBe(30)
    expect(result!.free).toBe(65)
    expect(result!.items.reserved.find((item) => item.key === 'chatNotes')?.tokens).toBe(10)
    expect(result!.opportunistic).toEqual([{ key: 'lorebooks', label: 'Lore', tokens: 500 }])
    mockData.notes[0].token_length = 25
    await act(async () => screen.update(<Consumer />))
    expect(result!.reserved).toBe(45)
    await act(async () => screen.unmount())
})

test('summary savings compare covered history against the replacement text', async () => {
    mockData.history[0].is_user = false
    mockData.history.push({ ...mockData.history[0], id: 2 })
    mockData.summaries = [
        {
            id: 1,
            status: 'accepted',
            enabled: true,
            content: 'Memory',
            start_entry_id: 1,
            end_entry_id: 1,
        },
    ]
    let result!: ReturnType<typeof useContextAllocation>
    const Consumer = () => {
        result = useContextAllocation()
        return null
    }
    let screen!: ReturnType<typeof create>
    await act(async () => {
        screen = create(<Consumer />)
    })
    expect(result.summarySavings).toBe(
        100 - Math.ceil('[Summary of earlier conversation]\nMemory'.length / 4)
    )
    expect(result.values.history).toBe(200 - result.summarySavings)
    await act(async () => screen.unmount())
})

test('context allocation keeps newest summaryRetainCount messages in active messages and excludes overlapping summaries', async () => {
    mockSummarySettings = { enabled: true, summaryRetainCount: 6 }
    mockData.history = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        token_length: 20,
        content_length: 80,
        has_content: 1,
        is_user: index % 2 === 0,
        reasoning_length: 0,
    }))
    mockData.summaries = [
        {
            id: 1,
            status: 'accepted',
            enabled: true,
            content: 'Memory',
            start_entry_id: 1,
            end_entry_id: 4,
        },
    ]
    let result!: ReturnType<typeof useContextAllocation>
    const Consumer = () => {
        result = useContextAllocation()
        return null
    }
    let screen!: ReturnType<typeof create>
    await act(async () => {
        screen = create(<Consumer />)
    })
    const activeTokens = result.items.history.find((item) => item.key === 'messages')?.tokens
    const summaryTokens = result.items.history.find((item) => item.key === 'summaries')?.tokens
    expect(activeTokens).toBe(120) // newest 6 messages (5..10) * 20 tokens
    expect(summaryTokens).toBe(Math.ceil('[Summary of earlier conversation]\nMemory'.length / 4))
    expect(result.summarySavings).toBe(80 - summaryTokens!)

    // If a summary overlaps the newest 6 messages (5..10), it is excluded so all 6 remain active.
    mockData.summaries = [
        {
            id: 2,
            status: 'accepted',
            enabled: true,
            content: 'Memory',
            start_entry_id: 1,
            end_entry_id: 6,
        },
    ]
    await act(async () => screen.update(<Consumer />))
    expect(result.items.history.find((item) => item.key === 'messages')?.tokens).toBe(200)
    expect(result.items.history.find((item) => item.key === 'summaries')?.tokens).toBe(0)
    expect(result.summarySavings).toBe(0)
    await act(async () => screen.unmount())
})
