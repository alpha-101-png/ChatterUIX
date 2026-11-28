import React, { act } from 'react'

import AppSettingsMenu from '../screens/AppSettingsScreen'

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        expoConfig: {
            version: '1.0',
        },
    },
}))

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, defaultValue?: string | Record<string, unknown>) => {
            if (typeof defaultValue === 'string') return defaultValue
            if (
                defaultValue &&
                typeof defaultValue === 'object' &&
                typeof defaultValue.defaultValue === 'string'
            ) {
                return defaultValue.defaultValue.replace(
                    '{{version}}',
                    String(defaultValue.version ?? '')
                )
            }
            return key
        },
    }),
}))

jest.mock('../lib/theme/ThemeManager', () => ({
    Theme: {
        useTheme: () => ({
            color: {
                neutral: { _200: '#222222', _300: '#333333' },
                text: { _300: '#cccccc', _400: '#999999', _500: '#777777' },
            },
            spacing: { xs: 2, s: 4, m: 8, l: 12, xl: 16, xl2: 24 },
            borderRadius: { l: 12, xl: 16 },
            borderWidth: { s: 1 },
        }),
    },
}))

jest.mock('../components/settings/SettingsPage', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
        require('react').createElement('SettingsPage', null, children),
}))

jest.mock('../components/settings/SettingsLink', () => ({
    __esModule: true,
    default: (props: object) => require('react').createElement('SettingsLink', props),
}))

jest.mock('../screens/AppSettingsScreen/LanguageSettings', () => ({
    __esModule: true,
    default: () => require('react').createElement('LanguageSettings'),
}))

jest.mock('../components/text/TText', () => ({
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode }) =>
        require('react').createElement('TText', props, children),
}))

const { create } = require('react-test-renderer')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

test('AppSettingsMenu renders subtle build version badge footer with Constants.expoConfig.version', () => {
    let renderer: any
    act(() => {
        renderer = create(<AppSettingsMenu />)
    })

    const texts = renderer.root
        .findAllByType('TText')
        .map((node: any) => node.props.children)
        .flat()

    expect(texts).toContain('FE Alpha')
    expect(texts).toContain('v1.0')
    expect(texts).toContain('Custom Build')

    act(() => renderer.unmount())
})
