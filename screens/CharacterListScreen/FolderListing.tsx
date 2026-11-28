import AntDesign from '@react-native-vector-icons/ant-design/static'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import ContextMenu from '@components/views/ContextMenu'
import { Theme } from '@lib/theme/ThemeManager'

export type FolderListingItem = {
    id: number
    name: string
    memberCount: number
    isPinned?: boolean
}

type FolderListingProps = {
    folder: FolderListingItem
    onPress: (folder: FolderListingItem) => void
    onTogglePin?: (folder: FolderListingItem) => void
    onRename?: (folder: FolderListingItem) => void
    onDelete?: (folder: FolderListingItem) => void
    menuDisabled?: boolean
}

const FolderListing: React.FC<FolderListingProps> = ({
    folder,
    onPress,
    onTogglePin,
    onRename,
    onDelete,
    menuDisabled = false,
}) => {
    const { t } = useTranslation()
    const { color } = Theme.useTheme()
    const styles = useStyles()
    const isCustomFolder = folder.id !== -1

    const rowContent = (
        <>
            <AntDesign name="folder" size={36} style={styles.icon} />
            <View style={styles.labelContainer}>
                <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                        {folder.name}
                    </Text>
                    {isCustomFolder && folder.isPinned && (
                        <AntDesign name="pushpin" size={13} color={color.primary._500} />
                    )}
                </View>
                <Text style={styles.count}>{folder.memberCount}</Text>
            </View>
            <AntDesign name="right" size={14} style={styles.chevron} />
        </>
    )

    if (!isCustomFolder) {
        return (
            <Pressable
                onPress={() => onPress(folder)}
                style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
                {rowContent}
            </Pressable>
        )
    }

    return (
        <ContextMenu disabled={menuDisabled} placement="center">
            <ContextMenu.Trigger onPress={() => onPress(folder)} longPress delayLongPress={300}>
                <View pointerEvents="none" style={styles.container}>
                    {rowContent}
                </View>
            </ContextMenu.Trigger>
            <ContextMenu.Body>
                <ContextMenu.Button
                    label={
                        folder.isPinned
                            ? t('character.folders.actions.unpin', 'Unpin')
                            : t('character.folders.actions.pin', 'Pin')
                    }
                    icon="pushpin"
                    closeOnPress={false}
                    onPress={(close) => {
                        close()
                        onTogglePin?.(folder)
                    }}
                />
                <ContextMenu.Button
                    label={t('character.folders.actions.rename', 'Rename')}
                    icon="edit"
                    closeOnPress={false}
                    onPress={(close) => {
                        close()
                        onRename?.(folder)
                    }}
                />
                <ContextMenu.Button
                    label={t('character.folders.actions.delete', 'Delete')}
                    icon="delete"
                    variant="warning"
                    closeOnPress={false}
                    onPress={(close) => {
                        close()
                        onDelete?.(folder)
                    }}
                />
            </ContextMenu.Body>
        </ContextMenu>
    )
}

export default FolderListing

const useStyles = () => {
    const { color, spacing, borderRadius, fontSize } = Theme.useTheme()
    return StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: color.neutral._100,
            borderRadius: borderRadius.m,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.xl,
            columnGap: spacing.l,
        },
        pressed: {
            opacity: 0.6,
        },
        icon: {
            color: color.primary._500,
        },
        labelContainer: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            columnGap: spacing.m,
        },
        nameRow: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            columnGap: spacing.sm,
        },
        name: {
            flexShrink: 1,
            fontSize: fontSize.l,
            fontWeight: '500',
            color: color.text._100,
        },
        count: {
            fontSize: fontSize.s,
            color: color.text._500,
        },
        chevron: {
            color: color.text._500,
        },
    })
}
