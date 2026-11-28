import { Storage } from '../lib/constants/storageKeys'
import { useSummarySettingsStore } from '../lib/summaries/settingsStore'

jest.mock('../lib/storage/MMKV', () => ({
    createMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}))

const initialOptions = useSummarySettingsStore.persist.getOptions()

beforeEach(() => {
    useSummarySettingsStore.persist.setOptions(initialOptions)
    useSummarySettingsStore.setState(useSummarySettingsStore.getInitialState(), true)
    jest.clearAllMocks()
})

test('summaryRetainCount defaults to 6 and clamps to 0..20 when updated or persisted', () => {
    const setItem = jest.fn()
    useSummarySettingsStore.persist.setOptions({
        storage: { getItem: () => null, setItem, removeItem: jest.fn() },
    })
    expect(useSummarySettingsStore.getState().summaryRetainCount).toBe(6)
    useSummarySettingsStore.getState().update({ summaryRetainCount: 12 })
    expect(useSummarySettingsStore.getState().summaryRetainCount).toBe(12)
    expect(setItem).toHaveBeenLastCalledWith(
        Storage.SummarySettings,
        expect.objectContaining({
            state: expect.objectContaining({ summaryRetainCount: 12 }),
        })
    )
    useSummarySettingsStore.getState().update({ summaryRetainCount: -5 })
    expect(useSummarySettingsStore.getState().summaryRetainCount).toBe(0)
    useSummarySettingsStore.getState().update({ summaryRetainCount: 42 })
    expect(useSummarySettingsStore.getState().summaryRetainCount).toBe(20)
})

test('rehydrating older persisted summary settings preserves default summaryRetainCount of 6', async () => {
    const legacy = {
        enabled: true,
        autoGenerate: true,
        autoThreshold: 75,
        maxOutputTokens: 512,
    }
    const getItem = jest.fn(() => ({ state: legacy, version: 0 }))
    useSummarySettingsStore.persist.setOptions({
        storage: { getItem: getItem as any, setItem: jest.fn(), removeItem: jest.fn() },
    })
    await useSummarySettingsStore.persist.rehydrate()
    expect(getItem).toHaveBeenCalledWith(Storage.SummarySettings)
    expect(useSummarySettingsStore.getState()).toMatchObject({
        ...legacy,
        summaryRetainCount: 6,
    })
})
