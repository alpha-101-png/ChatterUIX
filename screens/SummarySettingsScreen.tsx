import { useTranslation } from 'react-i18next'

import ThemedSlider from '@components/input/ThemedSlider'
import ThemedSwitchRow from '@components/input/ThemedSwitchRow'
import ThemedTextInput from '@components/input/ThemedTextInput'
import SettingsPage from '@components/settings/SettingsPage'
import SectionTitle from '@components/text/SectionTitle'
import TText from '@components/text/TText'
import {
    MAX_SUMMARY_RETAIN_COUNT,
    MIN_SUMMARY_RETAIN_COUNT,
    normalizeSummaryRetainCount,
} from '@lib/summaries/history'
import { useSummarySettingsStore } from '@lib/summaries/settingsStore'

const SummarySettingsScreen = () => {
    const { t } = useTranslation()
    const settings = useSummarySettingsStore()
    const retainCount = normalizeSummaryRetainCount(settings.summaryRetainCount)
    return (
        <SettingsPage title={t('summary.settings')}>
            <ThemedSwitchRow
                divider
                label={t('summary.enabled')}
                value={settings.enabled}
                onChangeValue={(enabled) => settings.update({ enabled })}
            />
            {settings.enabled && (
                <>
                    <ThemedSwitchRow
                        divider={!settings.autoGenerate}
                        label={t('summary.autoGenerate')}
                        value={settings.autoGenerate}
                        onChangeValue={(autoGenerate) => settings.update({ autoGenerate })}
                    />
                    {settings.autoGenerate && (
                        <>
                            <ThemedSlider
                                label={t('summary.threshold')}
                                min={25}
                                max={95}
                                step={5}
                                value={settings.autoThreshold}
                                onValueChange={(autoThreshold) =>
                                    settings.update({ autoThreshold })
                                }
                            />
                            <ThemedSlider
                                label={t('summary.minimumHistory')}
                                min={0}
                                max={50}
                                step={5}
                                value={settings.autoMinHistory}
                                onValueChange={(autoMinHistory) =>
                                    settings.update({ autoMinHistory })
                                }
                            />
                            <TText color="400" size={12}>
                                {t('summary.minimumHistoryDescription')}
                            </TText>
                            <ThemedSlider
                                label={t('summary.maximumCoverage')}
                                min={10}
                                max={100}
                                step={5}
                                value={settings.autoMaxCoverage}
                                onValueChange={(autoMaxCoverage) =>
                                    settings.update({ autoMaxCoverage })
                                }
                            />
                            <TText color="400" size={12}>
                                {t('summary.maximumCoverageDescription')}
                            </TText>
                            <ThemedSwitchRow
                                label={t('summary.consolidate')}
                                description={t('summary.consolidateDescription')}
                                value={settings.consolidateSummaries}
                                onChangeValue={(consolidateSummaries) =>
                                    settings.update({ consolidateSummaries })
                                }
                            />
                            <ThemedSwitchRow
                                label={t('summary.autoContinue')}
                                description={t('summary.autoContinueDescription')}
                                value={settings.autoContinueDrafts}
                                onChangeValue={(autoContinueDrafts) =>
                                    settings.update({ autoContinueDrafts })
                                }
                            />
                        </>
                    )}
                    <ThemedSlider
                        label={t('summary.retainCount', 'Keep Recent Messages Unsummarized')}
                        min={MIN_SUMMARY_RETAIN_COUNT}
                        max={MAX_SUMMARY_RETAIN_COUNT}
                        step={1}
                        value={retainCount}
                        onValueChange={(summaryRetainCount) =>
                            settings.update({ summaryRetainCount })
                        }
                    />
                    <TText color="400" size={12}>
                        {t('summary.retainCountDescription', {
                            count: retainCount,
                            defaultValue:
                                'The newest {{count}} messages stay intact in Active Messages instead of being compressed into the summary.',
                        })}
                    </TText>
                    <ThemedSlider
                        label={t('summary.outputTokens')}
                        min={128}
                        max={2048}
                        step={128}
                        value={settings.maxOutputTokens}
                        onValueChange={(maxOutputTokens) => settings.update({ maxOutputTokens })}
                    />
                    <ThemedSwitchRow
                        divider
                        label={t('summary.warnOnChanges')}
                        value={settings.warnOnSourceChanges}
                        onChangeValue={(warnOnSourceChanges) =>
                            settings.update({ warnOnSourceChanges })
                        }
                    />
                    <SectionTitle>{t('summary.prompt')}</SectionTitle>
                    <ThemedTextInput
                        multiline
                        value={settings.prompt}
                        onChangeText={(prompt) => settings.update({ prompt })}
                    />
                    <TText color="400">{t('summary.historyDescription')}</TText>
                </>
            )}
        </SettingsPage>
    )
}
export default SummarySettingsScreen
