import AntDesign, { type AntDesignIconName } from '@react-native-vector-icons/ant-design/static'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import Alert from '@components/views/Alert'
import { useBottomSheetRef } from '@components/views/BottomSheet'
import { Characters } from '@lib/state/characters'
import { useSelectionStore } from '@lib/state/characters/selectionStore'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'

import FolderPicker from './FolderPicker'

type SelectionBarProps = {
    /** All character IDs currently visible in the list (for "Select All"). */
    allCharacterIds: number[]
}

const SelectionBar: React.FC<SelectionBarProps> = ({ allCharacterIds }) => {
    const { t } = useTranslation()
    const { color } = Theme.useTheme()
    const folderPickerRef = useBottomSheetRef()
    const currentFolderId = useCharacterSortStore((state) => state.currentFolderId)

    const { selectedIds, exitSelectionMode, selectAll, deselectAll } = useSelectionStore(
        useShallow((state) => ({
            selectedIds: state.selectedIds,
            exitSelectionMode: state.exitSelectionMode,
            selectAll: state.selectAll,
            deselectAll: state.deselectAll,
        }))
    )

    const allSelected =
        allCharacterIds.length > 0 && selectedIds.length === allCharacterIds.length

    const handleToggleAll = () => {
        if (allSelected) {
            deselectAll()
        } else {
            selectAll(allCharacterIds)
        }
    }

    const handleDelete = () => {
        if (selectedIds.length === 0) return
        const idsToDelete = [...selectedIds]
        Alert.alert({
            title: t('character.selection.deleteTitle', 'Delete Characters'),
            description: t('character.selection.deleteDescription', {
                count: idsToDelete.length,
                defaultValue:
                    'Are you sure you want to delete {{count}} characters? This cannot be undone.',
            }),
            buttons: [
                { label: t('common.actions.cancel', 'Cancel') },
                {
                    label: t('common.actions.delete', 'Delete'),
                    type: 'warning',
                    onPress: async () => {
                        for (const id of idsToDelete) {
                            await Characters.actions.deleteCard(id)
                        }
                        Logger.info(
                            t('character.selection.deleted', {
                                count: idsToDelete.length,
                                defaultValue: 'Deleted {{count}} characters',
                            })
                        )
                        exitSelectionMode()
                    },
                },
            ],
        })
    }

    const handleMove = () => {
        if (selectedIds.length === 0) return
        folderPickerRef.current?.open()
    }

    const handleMoved = () => {
        Logger.info(
            t('character.selection.moved', {
                count: selectedIds.length,
                defaultValue: 'Moved {{count}} characters',
            })
        )
        exitSelectionMode()
    }

    return (
        <>
            <View
                style={[
                    styles.container,
                    {
                        backgroundColor: color.neutral._100,
                        borderTopColor: color.neutral._200,
                    },
                ]}>
                {/* Top row: count + Select All / Deselect All + Cancel */}
                <View style={styles.topRow}>
                    <Text style={[styles.countText, { color: color.text._100 }]}>
                        {t('character.selection.selectedCount', {
                            count: selectedIds.length,
                            defaultValue: '{{count}} selected',
                        })}
                    </Text>

                    <View style={styles.topActions}>
                        <HeaderChip
                            icon={allSelected ? 'minus-square' : 'check-square'}
                            label={
                                allSelected
                                    ? t('character.selection.deselectAll', 'Deselect All')
                                    : t('character.selection.selectAll', 'Select All')
                            }
                            onPress={handleToggleAll}
                            color={color.text._300}
                        />
                        <HeaderChip
                            icon="close"
                            label={t('character.selection.cancel', 'Cancel')}
                            onPress={exitSelectionMode}
                            color={color.text._400}
                        />
                    </View>
                </View>

                {/* Bottom row: Move to Folder + Delete */}
                <View style={styles.bottomRow}>
                    <ActionPill
                        icon="folder"
                        label={t('character.selection.moveToFolder', 'Move to Folder')}
                        onPress={handleMove}
                        backgroundColor={color.primary._500}
                        foregroundColor={color.text._100}
                        disabled={selectedIds.length === 0}
                    />
                    <ActionPill
                        icon="delete"
                        label={t('character.selection.delete', 'Delete')}
                        onPress={handleDelete}
                        backgroundColor={color.neutral._200}
                        foregroundColor={color.error._300}
                        disabled={selectedIds.length === 0}
                    />
                </View>
            </View>

            <FolderPicker
                ref={folderPickerRef}
                characterIds={selectedIds}
                currentFolderId={currentFolderId}
                onMoved={handleMoved}
            />
        </>
    )
}

export default SelectionBar

// ---------------------------------------------------------------------------

type HeaderChipProps = {
    icon: AntDesignIconName
    label: string
    onPress: () => void
    color: string
}

const HeaderChip: React.FC<HeaderChipProps> = ({ icon, label, onPress, color }) => (
    <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
        <AntDesign name={icon} size={16} color={color} />
        <Text style={[styles.chipLabel, { color }]} numberOfLines={1}>
            {label}
        </Text>
    </Pressable>
)

type ActionPillProps = {
    icon: AntDesignIconName
    label: string
    onPress: () => void
    backgroundColor: string
    foregroundColor: string
    disabled?: boolean
}

const ActionPill: React.FC<ActionPillProps> = ({
    icon,
    label,
    onPress,
    backgroundColor,
    foregroundColor,
    disabled,
}) => (
    <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
            styles.actionPill,
            { backgroundColor },
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
        ]}>
        <AntDesign name={icon} size={16} color={foregroundColor} />
        <Text style={[styles.actionPillLabel, { color: foregroundColor }]} numberOfLines={1}>
            {label}
        </Text>
    </Pressable>
)

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        rowGap: 10,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    topActions: {
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 14,
    },
    countText: {
        fontSize: 14,
        fontWeight: '600',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 6,
        paddingVertical: 4,
    },
    chipLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    bottomRow: {
        flexDirection: 'row',
        columnGap: 10,
    },
    actionPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    actionPillLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    pressed: {
        opacity: 0.7,
    },
    disabled: {
        opacity: 0.4,
    },
})
