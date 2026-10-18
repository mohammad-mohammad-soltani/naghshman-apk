package expo.modules.naghshmanmediachooser

import android.content.ContentUris
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.ValueCallback
import androidx.core.content.FileProvider
import com.reactnativecommunity.webview.RNCWebChromeClient
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

internal class PickedMedia : Record {
  /** A MediaStore id from expo-media-library, for items picked from the grid. */
  @Field
  var id: String? = null

  /** A file:// URI, for photos and videos just taken with the camera. */
  @Field
  var uri: String? = null

  @Field
  var video: Boolean = false
}

private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp")
private val VIDEO_EXTENSIONS = setOf("mp4", "m4v", "mov", "webm", "3gp", "mkv")

/**
 * Which media an <input type="file"> accepts, or null when it accepts anything
 * that is not a photo or video (documents, any file), which keeps the system
 * chooser. Mirrors src/lib/media-chooser-request.ts.
 */
internal fun mediaKinds(acceptTypes: Array<String>?): Pair<Boolean, Boolean>? {
  val tokens = acceptTypes.orEmpty()
    .flatMap { it.split(',') }
    .map { it.trim().lowercase() }
    .filter { it.isNotEmpty() }
  if (tokens.isEmpty()) return null

  var images = false
  var videos = false
  for (token in tokens) {
    when {
      token.startsWith("image/") -> images = true
      token.startsWith("video/") -> videos = true
      token.startsWith(".") && token.substring(1) in IMAGE_EXTENSIONS -> images = true
      token.startsWith(".") && token.substring(1) in VIDEO_EXTENSIONS -> videos = true
      else -> return null
    }
  }
  return images to videos
}

/**
 * Replaces react-native-webview's system file chooser for photo and video
 * inputs with an in-app sheet rendered in JS. Every intercepted request is
 * answered exactly once (picked files, null for cancel, or the system chooser),
 * otherwise the page's input would never open again.
 */
class NaghshmanMediaChooserModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  // Only touched on the main thread.
  private var pending: ValueCallback<Array<Uri>>? = null
  private var systemChooser: Runnable? = null

  // Without a mounted sheet nobody would answer the request, so the stock
  // chooser keeps handling it.
  @Volatile
  private var observing = false

  private val interceptor = RNCWebChromeClient.FileChooserInterceptor { callback, acceptTypes, allowMultiple, captureEnabled, stockChooser ->
    val kinds = mediaKinds(acceptTypes) ?: return@FileChooserInterceptor false
    if (!observing || !appContext.hasActiveReactInstance) return@FileChooserInterceptor false

    answer(null)
    pending = callback
    systemChooser = stockChooser
    sendEvent(
      "onMediaRequest",
      mapOf(
        "images" to kinds.first,
        "videos" to kinds.second,
        "multiple" to allowMultiple,
        "capture" to captureEnabled,
      ),
    )
    true
  }

  private fun answer(uris: Array<Uri>?) {
    val callback = pending ?: return
    pending = null
    systemChooser = null
    callback.onReceiveValue(uris)
  }

  private fun contentUri(item: PickedMedia): Uri? {
    item.id?.toLongOrNull()?.let { id ->
      val collection = if (item.video) {
        MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      }
      return ContentUris.withAppendedId(collection, id)
    }

    val uri = item.uri?.let(Uri::parse) ?: return null
    if (uri.scheme == "content") return uri
    if (uri.scheme != "file") return null
    val context = appContext.reactContext ?: return null
    return try {
      FileProvider.getUriForFile(context, "${context.packageName}.mediachooser", File(requireNotNull(uri.path)))
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NaghshmanMediaChooser")

    Events("onMediaRequest")

    OnStartObserving("onMediaRequest") {
      observing = true
    }

    OnStopObserving("onMediaRequest") {
      observing = false
      main.post { answer(null) }
    }

    OnCreate {
      RNCWebChromeClient.fileChooserInterceptor = interceptor
    }

    OnDestroy {
      main.post {
        if (RNCWebChromeClient.fileChooserInterceptor === interceptor) {
          RNCWebChromeClient.fileChooserInterceptor = null
        }
        answer(null)
      }
    }

    /** Hands the picked items to the page's file input. */
    Function("resolve") { items: List<PickedMedia> ->
      val uris = items.mapNotNull(::contentUri).toTypedArray()
      main.post { answer(uris.takeIf { it.isNotEmpty() }) }
    }

    Function("cancel") {
      main.post { answer(null) }
    }

    /** Opens the stock chooser (Files, other apps) for the pending request. */
    Function("openSystemChooser") {
      main.post {
        val chooser = systemChooser
        if (chooser == null) {
          answer(null)
        } else {
          pending = null
          systemChooser = null
          chooser.run()
        }
      }
    }
  }
}
