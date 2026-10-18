package expo.modules.naghshmanmediachooser

import androidx.core.content.FileProvider

// A subclass keeps this provider from clashing with other libraries that
// declare androidx's FileProvider in the merged manifest.
class MediaChooserFileProvider : FileProvider()
