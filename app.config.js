module.exports = {
    expo: {
        name: 'FE Alpha',
        newArchEnabled: true,
        slug: 'ChatterUI',
        version: '1.0',
        orientation: 'default',
        icon: './assets/custom-app-icon.png',
        scheme: 'comalphafrontend',
        userInterfaceStyle: 'automatic',
        assetBundlePatterns: ['**/*'],
        ios: {
            supportsTablet: true,
            package: 'com.alpha.frontend',
            bundleIdentifier: 'com.alpha.frontend',
        },
        android: {
            adaptiveIcon: {
                foregroundImage: './assets/custom-adaptive-icon.png',
                backgroundColor: '#121218',
            },
            package: 'com.alpha.frontend',
            userInterfaceStyle: 'dark',
            permissions: [
                'android.permission.FOREGROUND_SERVICE',
                'android.permission.WAKE_LOCK',
                'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
            ],
        },
        web: {
            bundler: 'metro',
            output: 'static',
            favicon: './assets/images/adaptive-icon.png',
        },
        plugins: [
            [
                'expo-asset',
                {
                    assets: ['./assets/models/aibot.raw', './assets/models/llama3tokenizer.gguf'],
                },
            ],
            [
                'expo-build-properties',
                {
                    android: {
                        largeHeap: true,
                        usesCleartextTraffic: true,
                        buildArchs: ['arm64-v8a'],
                        enableProguardInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        useLegacyPackaging: true,
                        extraProguardRules: '-keep class com.rnllama.** { *; }',
                    },
                },
            ],
            [
                'expo-splash-screen',
                {
                    image: './assets/custom-splash-icon.png',
                    backgroundColor: '#121218',
                    dark: {
                        image: './assets/custom-splash-icon.png',
                        backgroundColor: '#121218',
                    },
                    imageWidth: 200,
                },
            ],
            [
                'expo-notifications',
                {
                    icon: './assets/images/notification.png',
                },
            ],
            [
                './expo-build-plugins/androidattributes.plugin.js',
                {
                    'android:largeHeap': true,
                },
            ],
            ['@vali98/react-native-process-text', { label: 'Ask In ChatterUi' }],
            [
                'expo-camera',
                {
                    cameraPermission: 'Allow ChatterUI to access your camera',
                },
            ],
            ['expo-sqlite', { withSQLiteVecExtension: true }],
            [
                'expo-image-picker',
                {
                    photosPermission: 'ChatterUI requires image permissions for vision models',
                    colors: {
                        cropToolbarColor: '#000000',
                    },
                    dark: {
                        colors: {
                            cropToolbarColor: '#000000',
                        },
                    },
                },
            ],
            [
                'expo-audio',
                {
                    enableBackgroundPlayback: true,
                    recordAudioAndroid: true,
                    microphonePermission: 'Allow ChatterUI to access your microphone',
                },
            ],
            'expo-localization',
            'expo-router',
            'expo-font',
            'expo-image',
            './expo-build-plugins/bgactions.plugin.js',
            './expo-build-plugins/usercert.plugin.js',
            './expo-build-plugins/rnllama.plugin.js',
            './expo-build-plugins/copyhtp.plugin.js',
            /**
             * Future icon usage will need to be added here
             * https://github.com/oblador/react-native-vector-icons/blob/master/docs/SETUP-EXPO.md
             */
            '@react-native-vector-icons/ant-design',
            '@react-native-vector-icons/octicons',
            '@react-native-vector-icons/material-icons',
        ],
        experiments: {
            typedRoutes: true,
            reactCompiler: true,
        },
        extra: {
            router: {
                origin: false,
            },
            eas: {
                projectId: '45814327-396c-415b-87e0-afdb1003f95a',
            },
        },
    },
}
