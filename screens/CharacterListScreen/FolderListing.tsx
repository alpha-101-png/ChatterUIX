import AntDesign from '@react-native-vector-icons/ant-design/static'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Theme } from '@lib/theme/ThemeManager'

export type FolderListingItem = {
    id: number
    name: string
    memberCount: number
}

type FolderListingProps = {
    folder: FolderListingItem
    onPress: (folder: FolderListingItem) => void
}

const FolderListing: React.FC<FolderListingProps> = ({ folder, onPress }) => {
    const styles = useStyles()
    return (
        <Pressable
            onPress={() => onPress(folder)}
            style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
            <AntDesign name="folder" size={36} style={styles.icon} />
            <View style={styles.labelContainer}>
                <Text style={styles.name} numberOfLines={1}>
                    {folder.name}
                </Text>
                <Text style={styles.count}>{folder.memberCount}</Text>
            </View>
            <AntDesign name="right" size={14} style={styles.chevron} />
        </Pressable>
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
        name: {
            flex: 1,
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
