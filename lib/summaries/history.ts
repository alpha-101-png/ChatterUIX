import type { ChatSummary } from '@db/schema'
import type { ChatMessage } from '@lib/state/chat/types'

export const DEFAULT_SUMMARY_RETAIN_COUNT = 6
export const MIN_SUMMARY_RETAIN_COUNT = 0
export const MAX_SUMMARY_RETAIN_COUNT = 20

export const normalizeSummaryRetainCount = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(MAX_SUMMARY_RETAIN_COUNT, Math.max(MIN_SUMMARY_RETAIN_COUNT, Math.round(value)))
        : DEFAULT_SUMMARY_RETAIN_COUNT

const hasVisibleSummaryContent = (message: ChatMessage) =>
    message.is_user || message.swipes.some((swipe) => swipe.active && swipe.swipe.trim())

export const eligibleSummaryCutoff = (
    messages: { id: number; is_user: boolean; hasContent: boolean }[],
    retainCount = 0
) => {
    const assistantCutoff = messages
        .filter((message) => !message.is_user && message.hasContent)
        .at(-2)?.id
    if (assistantCutoff === undefined) return undefined
    const count = Math.max(0, Math.floor(retainCount))
    if (count === 0) return assistantCutoff
    const retained = messages.filter((message) => message.is_user || message.hasContent)
    if (retained.length <= count) return undefined
    return Math.min(assistantCutoff, retained[retained.length - 1 - count].id)
}

// The newest eligible endpoint is the second-latest assistant response, inclusive,
// further bounded so at least `retainCount` newest messages stay unsummarized.
export const summaryCutoff = (messages: ChatMessage[], retainCount = 0) =>
    eligibleSummaryCutoff(
        messages.map((message) => ({
            id: message.id,
            is_user: message.is_user,
            hasContent: message.swipes.some((swipe) => swipe.active && !!swipe.swipe.trim()),
        })),
        retainCount
    )

export const usableSummaries = (
    messages: ChatMessage[],
    summaries: ChatSummary[],
    retainCount = 0
) => {
    return usableSummariesBefore(summaryCutoff(messages, retainCount), summaries)
}

export const usableSummariesBefore = (cutoff: number | undefined, summaries: ChatSummary[]) => {
    if (cutoff === undefined) return []
    // Resolve overlapping accepted ranges in favor of the newest summary.
    const selected: ChatSummary[] = []
    for (const summary of [...summaries].sort((a, b) => b.id - a.id)) {
        if (
            summary.status !== 'accepted' ||
            !summary.content.trim() ||
            summary.end_entry_id > cutoff
        )
            continue
        if (
            selected.some(
                (other) =>
                    summary.start_entry_id <= other.end_entry_id &&
                    summary.end_entry_id >= other.start_entry_id
            )
        )
            continue
        selected.push(summary)
    }
    return selected.sort((a, b) => a.start_entry_id - b.start_entry_id)
}

export const summarizeHistory = (
    messages: ChatMessage[],
    summaries: ChatSummary[],
    cutoff = summaryCutoff(messages)
): ChatMessage[] => {
    const selected = usableSummariesBefore(cutoff, summaries)
    if (!selected.length) return messages
    const result: ChatMessage[] = []
    let index = 0
    const append = (summary: ChatSummary) =>
        result.push(
            summaryMessage(
                -10_000 - summary.id,
                `[Summary of earlier conversation]\n${summary.content}`
            )
        )
    for (const message of messages) {
        while (index < selected.length && selected[index].end_entry_id < message.id)
            append(selected[index++])
        const summary = selected[index]
        if (summary && message.id >= summary.start_entry_id && message.id <= summary.end_entry_id) {
            // Emit at the end of its range, even when some covered entries were deleted.
            continue
        }
        result.push(message)
    }
    while (index < selected.length) append(selected[index++])
    return result
}

export const summaryMessage = (id: number, text: string, isUser = true): ChatMessage => ({
    id: id,
    chat_id: -1,
    name: '',
    is_user: isUser,
    order: 0,
    swipe_id: 0,
    attachments: [],
    swipes: [
        {
            id: id,
            entry_id: id,
            swipe: text,
            active: true,
            send_date: new Date(),
            gen_started: new Date(),
            gen_finished: new Date(),
            timings: null,
            token_length: null,
            reset_length: null,
        },
    ],
})

export const selectSummarySources = (
    messages: ChatMessage[],
    summaries: ChatSummary[],
    replacesId?: number,
    extendRange = false,
    range?: { startEntryId: number; endEntryId: number },
    retainCount = 0,
    cutoffOverride?: number | null
) => {
    const cutoff =
        cutoffOverride === undefined
            ? summaryCutoff(messages, retainCount)
            : (cutoffOverride ?? undefined)
    if (cutoff === undefined) return []
    const replacement = summaries.find((item) => item.id === replacesId)
    const used = usableSummariesBefore(
        cutoff,
        summaries.filter((item) => item.id !== replacesId && item.id !== replacement?.replaces_id)
    )
    const eligible = messages.filter(
        (message) =>
            message.id <= cutoff &&
            (!range || (message.id >= range.startEntryId && message.id <= range.endEntryId)) &&
            (!replacement ||
                (message.id >= replacement.start_entry_id &&
                    (extendRange || message.id <= replacement.end_entry_id)))
    )
    const selected: ChatMessage[] = []
    for (const message of eligible) {
        const covered = used.some(
            (item) => message.id >= item.start_entry_id && message.id <= item.end_entry_id
        )
        if (covered && selected.length) break
        if (!covered) selected.push(message)
    }
    return selected
}

export const countUnsummarizedMessages = (messages: ChatMessage[], summaries: ChatSummary[]) => {
    const accepted = summaries.filter(
        (summary) => summary.status === 'accepted' && summary.content.trim()
    )
    return messages.filter(
        (message) =>
            hasVisibleSummaryContent(message) &&
            !accepted.some(
                (summary) =>
                    message.id >= summary.start_entry_id && message.id <= summary.end_entry_id
            )
    ).length
}

export const summaryTranscript = (messages: ChatMessage[]) =>
    messages
        .map((message) => {
            const text = message.swipes.find((swipe) => swipe.active)?.swipe ?? ''
            return `${message.is_user ? 'User' : 'Assistant'} (${message.name}): ${text}`
        })
        .join('\n\n')
