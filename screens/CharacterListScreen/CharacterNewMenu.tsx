import type { RefObject } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useBottomSheetRef } from '@components/views/BottomSheet'
import ContextMenu from '@components/views/ContextMenu'
import InputSheet from '@components/views/InputSheet'
import { Characters } from '@lib/state/characters'
import { useCharacterImportState } from '@lib/state/characters/importState'
import { useCharacterSortStore } from '@lib/state/characters/sortStore'
import { Logger } from '@lib/state/Logger'

type CharacterNewMenuProps = {
    navigationPending: RefObject<boolean>
}

const CharacterNewMenu: React.FC<CharacterNewMenuProps> = ({ navigationPending }) => {
    const { t } = useTranslation()
    const isImporting = useCharacterImportState((state) => state.isImporting)
    const { selectCharacterCard } = Characters.useCharacterState(
        useShallow((state) => ({
            selectCharacterCard: state.setCard,
            id: state.id,
        }))
    )

    const router = useRouter()
    const inputRef = useBottomSheetRef()
    const newFolderRef = useBottomSheetRef()

    const handleCreateCharacter = async (text: string) => {
        if (!text) {
            Logger.errorToast(t('character.list.errors.nameEmpty', 'Name Cannot Be Empty!'))
            return
        }
        if (navigationPending.current) return
        navigationPending.current = true
        try {
            const currentFolderId = useCharacterSortStore.getState().currentFolderId
            const id = await Characters.db.create.blankCard(
                text,
                typeof currentFolderId === 'number' ? { folderId: currentFolderId } : undefined
            )
            selectCharacterCard(id)
            router.push('/characterEditor')
        } finally {
            navigationPending.current = false
        }
    }

    const handleCreateFolder = async (name: string) => {
        if (!name.trim()) {
            Logger.errorToast(t('character.folders.errors.nameEmpty', 'Folder name cannot be empty'))
            return
        }
        await Characters.db.folders.create(name.trim())
        Logger.info(t('character.folders.created', { name: name.trim(), defaultValue: 'Created folder: {{name}}' }))
    }

    return (
        <>
            <InputSheet
                ref={inputRef}
                title={t('character.list.actions.createNewCharacter', 'Create New Character')}
                onConfirm={handleCreateCharacter}
                verifyText={(text) =>
                    text.length === 0 ? t('character.list.errors.nameCannotBeEmpty', 'Name cannot be empty') : ''
                }
                placeholder="Name..."
                autoFocus
                confirmLabel={t('common.actions.create', 'Create')}
            />

            <InputSheet
                ref={newFolderRef}
                title={t('character.folders.actions.createFolder', 'Create Folder')}
                onConfirm={handleCreateFolder}
                verifyText={(text) =>
                    text.trim().length === 0 ? t('character.folders.errors.nameEmpty', 'Folder name cannot be empty') : ''
                }
                placeholder={t('character.folders.namePlaceholder', 'Folder name…')}
                autoFocus
                confirmLabel={t('common.actions.create', 'Create')}
            />

            <ContextMenu placement="bottom">
                <ContextMenu.Trigger icon="user-add" />
                <ContextMenu.Body>
                    <ContextMenu.Button
                        label={t('character.list.actions.importFromFile', 'Import From File')}
                        disabled={isImporting}
                        onPress={async () => {
                            try {
                                const currentFolderId =
                                    useCharacterSortStore.getState().currentFolderId
                                await Characters.actions.importCards(
                                    typeof currentFolderId === 'number'
                                        ? { folderId: currentFolderId }
                                        : undefined
                                )
                            } catch (error) {
                                Logger.errorToast(t('character.editor.errors.createFailed', 'Failed to create character'), error)
                            }
                        }}
                        icon="upload"
                    />
                    <ContextMenu.Button
                        label={t('character.list.actions.createCharacter', 'Create Character')}
                        onPress={() => {
                            inputRef.current?.open()
                        }}
                        icon="edit"
                    />
                    <ContextMenu.Button
                        label={t('character.folders.actions.createFolder', 'Create Folder')}
                        onPress={() => {
                            newFolderRef.current?.open()
                        }}
                        icon="folder"
                    />
                </ContextMenu.Body>
            </ContextMenu>
        </>
    )
}

export default CharacterNewMenu
