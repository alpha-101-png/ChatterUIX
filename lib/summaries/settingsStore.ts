import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { Storage } from '@lib/constants/storageKeys'
import { createMMKVStorage } from '@lib/storage/MMKV'
import {
    DEFAULT_SUMMARY_RETAIN_COUNT,
    normalizeSummaryRetainCount,
} from '@lib/summaries/history'

export const defaultSummarizerPrompt =
    'Summarize this conversation as factual memory for continuing it. Preserve important events, decisions, relationships, names, unresolved questions, and relevant details. Do not invent information. Infer image contents only from the surrounding text. Return only the summary.'

export type SummarySettings = {
    enabled: boolean
    autoContinueDrafts: boolean
    autoGenerate: boolean
    autoMinHistory: number
    autoMaxCoverage: number
    consolidateSummaries: boolean
    autoThreshold: number
    maxOutputTokens: number
    warnOnSourceChanges: boolean
    summaryRetainCount: number
    prompt: string
}

export const useSummarySettingsStore = create<
    SummarySettings & {
        update: (changes: Partial<SummarySettings>) => void
    }
>()(
    persist(
        (set) => ({
            enabled: true,
            autoContinueDrafts: false,
            autoGenerate: false,
            autoThreshold: 80,
            autoMinHistory: 10,
            autoMaxCoverage: 50,
            consolidateSummaries: false,
            maxOutputTokens: 1024,
            warnOnSourceChanges: true,
            summaryRetainCount: DEFAULT_SUMMARY_RETAIN_COUNT,
            prompt: defaultSummarizerPrompt,
            update: (changes) =>
                set(
                    changes.summaryRetainCount === undefined
                        ? changes
                        : {
                              ...changes,
                              summaryRetainCount: normalizeSummaryRetainCount(
                                  changes.summaryRetainCount
                              ),
                          }
                ),
        }),
        { name: Storage.SummarySettings, storage: createMMKVStorage() }
    )
)
