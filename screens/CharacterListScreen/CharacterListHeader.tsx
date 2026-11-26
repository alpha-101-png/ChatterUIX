import AntDesign from '@react-native-vector-icons/ant-design/static'
import { count, eq, notInArray } from 'drizzle-orm'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native'
import { useMMKVBoolean } from 'react-native-mmkv'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import IconButton from '@components/buttons/IconButton'
import ListEditorSheet from '@components/input/ListEditorSheet'
import ThemedTextInput from '@components/input/ThemedTextInput'
import { useBottomSheetRef } from '@components/views/BottomSheet'
import { db } from '@db/db'
import { characterTags, tags } from '@db/schema'
import { AppSettings } from '@lib/constants/appSettings'
import { useLiveQueryAsync } from '@lib/hooks/liveQuery'
import { Characters } from '@lib/state/characters'
import { useSelectionStore } from '@lib/state/characters/selectionStore'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { Logger } from '@lib/state/Logger'
import { TagHider } from '@lib/state/TagHider'
import { Theme } from '@lib/theme/ThemeManager'

import FolderManagerSheet from './FolderManagerSheet'
import SortButton from './SortButton'

type CharacterListHeaderProps = {
    resultLength: number
}

const CharacterListHeader: React.FC<CharacterListHeaderProps> = ({ resultLength }) => {
    const { t } = useTranslation()
    const { color } = Theme.useTheme()
    const folderManagerRef = useBottomSheetRef()

    const [useTagHider, setUseTagHider] = useMMKVBoolean(AppSettings.UseTagHider)
    const {
        showSearch,
        setShowSearch,
        textFilter,
        setTextFilter,
        tagFilter,
        setTagFilter,
        currentFolderId,
        setCurrentFolder,
    } = useCharacterSortStore(
        useShallow((state) => ({
            showSearch: state.showSearch,
            setShowSearch: state.setShowSearch,
            textFilter: state.textFilter,
            setTextFilter: state.setTextFilter,
            tagFilter: state.tagFilter,
            setTagFilter: state.setTagFilter,
            currentFolderId: state.currentFolderId,
            setCurrentFolder: state.setCurrentFolder,
        }))
    )

    const { selectionMode, enterSelectionMode, exitSelectionMode } = useSelectionStore(
        useShallow((state) => ({
            selectionMode: state.selectionMode,
            enterSelectionMode: state.enterSelectionMode,
            exitSelectionMode: state.exitSelectionMode,
        }))
    )

    const [showTags, setShowTags] = useMMKVBoolean(AppSettings.ShowTags)
    const hiddenTags = TagHider.useHiddenTags()

    // Live folder name when inside a numbered folder
    const { data: folderData } = useLiveQueryAsync(Characters.db.folders.liveList(), {
        key: ['folder-list-header'],
        watch: [{ table: 'character_folders' }],
    })
    const currentFolder =
        typeof currentFolderId === 'number'
            ? (folderData.find((f) => f.id === currentFolderId) ?? null)
            : null

    // Determine breadcrumb label for the current view
    const isRoot = currentFolderId === undefined
    const isUngrouped = currentFolderId === null
    const isInsideFolder = currentFolderId !== undefined

    const currentFolderLabel = isUngrouped
        ? t('character.folders.ungrouped', 'Ungrouped')
        : (currentFolder?.name ?? '')

    const { data } = useLiveQueryAsync(
        db
            .select({
                tag: tags.tag,
                tagCount: count(characterTags.tag_id),
            })
            .from(tags)
            .leftJoin(characterTags, eq(characterTags.tag_id, tags.id))
            .groupBy(tags.tag)
            .where(notInArray(tags.tag, hiddenTags)),
        {
            key: ['visible-tags', hiddenTags],
            watch: [{ table: 'tags' }, { table: 'character_tags' }],
        }
    )

    useFocusEffect(
        useCallback(() => {
            if (!showSearch) return
            const handler = BackHandler.addEventListener('hardwareBackPress', () => {
                setTextFilter('')
                setShowSearch(false)
                return true
            })
            return () => handler.remove()
        }, [setShowSearch, setTextFilter, showSearch])
    )

    return (
        <>
            {/* Folder breadcrumb bar */}
            <Animated.View
                layout={LinearTransition.duration(200)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: 16,
                    paddingRight: 8,
                    paddingBottom: 8,
                    columnGap: 8,
                }}>
                {/* "Folders" pill — always shown, tapping resets to root */}
                <Pressable
                    onPress={() => setCurrentFolder(undefined)}
                    style={({ pressed }) => [
                        styles.pill,
                        {
                            backgroundColor: isRoot ? color.primary._500 : color.neutral._200,
                            opacity: pressed ? 0.7 : 1,
                        },
                    ]}>
                    <Text
                        style={[
                            styles.pillText,
                            {
                                color: isRoot ? color.text._100 : color.text._400,
                            },
                        ]}>
                        {t('character.folders.folders', 'Folders')}
                    </Text>
                </Pressable>

                {/* Current folder / Ungrouped crumb */}
                {isInsideFolder && currentFolderLabel !== '' && (
                    <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(100)}
                        style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
                        <AntDesign name="right" size={12} color={color.text._500} />
                        <View style={[styles.pill, { backgroundColor: color.primary._500 }]}>
                            <Text style={[styles.pillText, { color: color.text._100 }]}>
                                {currentFolderLabel}
                            </Text>
                        </View>
                    </Animated.View>
                )}

                <View style={{ flex: 1 }} />

                {/* Multi-select toggle — inside any folder (including Ungrouped) */}
                {isInsideFolder && (
                    <IconButton
                        iconName={{ family: 'antdesign', name: 'check-square' }}
                        variant="tertiary"
                        onPress={() => (selectionMode ? exitSelectionMode() : enterSelectionMode())}
                        iconStyle={{
                            color: selectionMode ? color.primary._500 : color.text._500,
                        }}
                    />
                )}

                {/* Manage folders button */}
                <IconButton
                    iconName="folder"
                    variant="tertiary"
                    onPress={() => folderManagerRef.current?.open()}
                    iconStyle={{ color: color.text._500 }}
                />
            </Animated.View>

            <View
                style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingLeft: 16,
                    paddingRight: 8,
                    paddingBottom: 12,
                }}>
                <View
                    style={{
                        columnGap: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}>
                    <Text
                        style={{
                            color: color.text._400,
                            fontSize: 16,
                        }}>
                        {t('character.list.sort.label', 'Sort By')}
                    </Text>
                    <SortButton
                        sortBy="modified"
                        label={t('character.list.sort.recent', 'Recent')}
                    />
                    <SortButton sortBy="name" label={t('character.list.columns.name', 'Name')} />
                </View>
                <View
                    style={{
                        flexDirection: 'row',
                        columnGap: 12,
                    }}>
                    <IconButton
                        iconName="tag"
                        variant="tertiary"
                        onPress={() => {
                            setShowTags(!showTags)
                            if (showTags && tagFilter.length > 0) {
                                setTagFilter([])
                            }
                        }}
                        iconStyle={{
                            color: showTags ? color.text._100 : color.text._700,
                        }}
                    />
                    <IconButton
                        variant="tertiary"
                        iconName={showSearch ? 'close' : { family: 'material', name: 'search' }}
                        onPress={() => {
                            setShowSearch(!showSearch)
                        }}
                        iconSize={24}
                        delayLongPress={5000}
                        onLongPress={() => {
                            setUseTagHider(!useTagHider)
                            Logger.infoToast(
                                t(
                                    !useTagHider
                                        ? 'character.list.messages.hiderEnabled'
                                        : 'character.list.messages.hiderDisabled'
                                )
                            )
                        }}
                    />
                </View>
            </View>

            <Animated.View
                collapsable={false}
                layout={LinearTransition.duration(200)}
                style={{ overflow: 'hidden' }}>
                {showSearch && (
                    <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(100)}
                        style={{ paddingHorizontal: 12, paddingBottom: 8, rowGap: 8 }}>
                        {showTags && data.length > 0 && (
                            <ListEditorSheet
                                suggestions={[...data]
                                    .sort((a, b) => b.tagCount - a.tagCount)
                                    .map((item) => item.tag)}
                                title={t('character.list.search.byTags', 'Search By Tags')}
                                value={tagFilter}
                                onChangeValue={setTagFilter}
                                keyExtractor={(item) => item}
                                labelExtractor={(item) => item}
                                commitMode="immediate"
                                previewNumber={3}
                            />
                        )}
                        <ThemedTextInput
                            label={t('character.list.search.byName', 'Search By Name')}
                            value={textFilter}
                            onChangeText={setTextFilter}
                            style={{
                                color: resultLength === 0 ? color.text._700 : color.text._100,
                            }}
                            placeholder="Name..."
                        />
                        {(textFilter || tagFilter.length > 0) && (
                            <Text
                                style={{
                                    marginTop: 8,
                                    color: color.text._400,
                                }}>
                                {t('common.labels.results', 'Results')}: {resultLength}
                            </Text>
                        )}
                    </Animated.View>
                )}
            </Animated.View>

            <FolderManagerSheet ref={folderManagerRef} />
        </>
    )
}

export default CharacterListHeader

const styles = StyleSheet.create({
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
    },
    pillText: {
        fontSize: 13,
        fontWeight: '500',
    },
})
