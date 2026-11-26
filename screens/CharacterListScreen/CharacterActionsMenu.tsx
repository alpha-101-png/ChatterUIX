import { usePathname, useRouter } from 'expo-router'
import { type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import Alert from '@components/views/Alert'
import ContextMenu from '@components/views/ContextMenu'
import { useBottomSheetRef } from '@components/views/BottomSheet'
import { useConnectionStore } from '@lib/engine/API/connectionStore'
import { CharacterCardSummary, Characters } from '@lib/state/characters'
import { useSelectionStore } from '@lib/state/characters/selectionStore'
import { Chats } from '@lib/state/chat'
import { Instructs } from '@lib/state/Instructs'
import { Logger } from '@lib/state/Logger'
import { useSamplerStore } from '@lib/state/samplerStore'

import FolderPicker from './FolderPicker'

type CharacterActionsMenuProps = {
    character: CharacterCardSummary
    navigationPending: RefObject<boolean>
    children: ReactNode
}

const CharacterActionsMenu: React.FC<CharacterActionsMenuProps> = ({
    character,
    navigationPending,
    children,
}) => {
    const { t } = useTranslation()
    const path = usePathname()
    const router = useRouter()
    const folderPickerRef = useBottomSheetRef()

    const selectionMode = useSelectionStore((state) => state.selectionMode)
    const toggleSelection = useSelectionStore((state) => state.toggleSelection)
    const enterSelectionMode = useSelectionStore((state) => state.enterSelectionMode)

    const { setId } = Chats.useChat()
    const selectUserCard = Characters.useUserStore((state) => state.setCard)
    const setInstruct = Instructs.useInstruct((state) => state.load)
    const setConnection = useConnectionStore((state) => state.setActiveConnection)
    const setSampler = useSamplerStore((state) => state.setCurrentConfig)

    const handleOpenChat = async () => {
        if (navigationPending.current || path === '/chat' || !character.id) return
        navigationPending.current = true
        try {
            selectCharacterCard(character.id)
            character?.links.forEach((item) => {
                switch (item.type) {
                    case 'user_id':
                        Logger.info(t('character.editor.links.loadUser', { value: item.value }))
                        selectUserCard(item.value)
                        break
                    case 'instruct_id':
                        Logger.info(t('character.editor.links.loadInstruct', { value: item.value }))
                        setInstruct(item.value)
                        break
                    case 'connection_id':
                        Logger.info(
                            t('character.editor.links.loadConnection', { value: item.value })
                        )
                        setConnection(item.value)
                        break
                    case 'sampler_id':
                        Logger.info(t('character.editor.links.loadSampler', { value: item.value }))
                        setSampler(item.value)
                        break
                }
            })
            let chatId = character.latestChatId
            if (!chatId) {
                chatId = await Chats.actions.createChat(character.id)
            }
            if (!chatId) {
                Logger.errorToast(t('character.list.errors.chatCreationFailed'))
                return
            }
            await setId(chatId)
            router.push('/chat')
        } catch (error) {
            Logger.errorToast(t('character.list.errors.load', { error }))
        } finally {
            navigationPending.current = false
        }
    }

    const selectCharacterCard = Characters.useCharacterState((state) => state.setCard)

    const handleDeleteCard = (close: () => void) => {
        close()
        Alert.alert({
            title: t('character.editor.dialogs.deleteCharacter.title'),
            description: t('character.editor.dialogs.deleteCharacter.description', {
                name: character.name,
            }),
            buttons: [
                {
                    label: t('common.actions.cancel'),
                },
                {
                    label: t('character.editor.dialogs.deleteCharacter.confirm'),
                    onPress: async () => {
                        await Characters.actions.deleteCard(character.id ?? -1)
                    },
                    type: 'warning',
                },
            ],
        })
    }

    const handleDuplicateCard = (close: () => void) => {
        close()
        Alert.alert({
            title: t('character.editor.dialogs.clone.title'),
            description: t('character.editor.dialogs.clone.description', { name: character.name }),
            buttons: [
                {
                    label: t('common.actions.cancel'),
                },
                {
                    label: t('character.editor.dialogs.clone.confirm'),
                    onPress: async () => {
                        await Characters.actions.duplicateCard(character.id)
                    },
                },
            ],
        })
    }

    const handleEditCard = (close: () => void) => {
        if (navigationPending.current) return
        selectCharacterCard(character.id)
        close()
        router.push('/characterEditor')
    }

    const handleMoveToFolder = (close: () => void) => {
        close()
        folderPickerRef.current?.open()
    }

    const handleSelect = (close: () => void) => {
        close()
        enterSelectionMode(character.id)
    }

    const handleTogglePin = async (close: () => void) => {
        close()
        await Characters.db.update.setPinned(character.id, !character.isPinned)
    }

    if (selectionMode) {
        return (
            <Pressable
                accessibilityRole="button"
                disabled={path !== '/'}
                onPress={() => toggleSelection(character.id)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <View pointerEvents="none">{children}</View>
            </Pressable>
        )
    }

    return (
        <>
            <ContextMenu disabled={path !== '/'} placement="center">
                <ContextMenu.Trigger onPress={handleOpenChat} longPress delayLongPress={300}>
                    <View pointerEvents="none">{children}</View>
                </ContextMenu.Trigger>
                <ContextMenu.Body>
                    <ContextMenu.Button
                        label={t('common.actions.edit', 'Edit')}
                        icon="edit"
                        closeOnPress={false}
                        onPress={handleEditCard}
                    />
                    <ContextMenu.Button
                        label={t('common.actions.clone', 'Clone')}
                        icon="copy"
                        closeOnPress={false}
                        onPress={handleDuplicateCard}
                    />
                    <ContextMenu.Button
                        label={
                            character.isPinned
                                ? t('character.list.actions.unpin', 'Unpin')
                                : t('character.list.actions.pin', 'Pin')
                        }
                        icon="pushpin"
                        closeOnPress={false}
                        onPress={handleTogglePin}
                    />
                    <ContextMenu.Button
                        label={t('character.folders.actions.moveToFolder', 'Move to Folder')}
                        icon="folder"
                        closeOnPress={false}
                        onPress={handleMoveToFolder}
                    />
                    <ContextMenu.Button
                        label={t('character.folders.actions.select', 'Select')}
                        icon="check"
                        closeOnPress={false}
                        onPress={handleSelect}
                    />
                    <ContextMenu.Button
                        label={t('common.actions.delete', 'Delete')}
                        icon="delete"
                        closeOnPress={false}
                        onPress={handleDeleteCard}
                        variant="warning"
                    />
                </ContextMenu.Body>
            </ContextMenu>

            <FolderPicker
                ref={folderPickerRef}
                characterId={character.id}
                currentFolderId={character.folderId}
            />
        </>
    )
}

export default CharacterActionsMenu
